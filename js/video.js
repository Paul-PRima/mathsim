// Offline video export to MP4. WebCodecs encodes each frame (H.264 when available, otherwise VP9) and a
// small built-in MP4 muxer writes the file. Frames carry exact timestamps, so the video plays at the right
// speed no matter how long each frame took to render.
const Video = (() => {
  const supported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  // Off-page canvas: OffscreenCanvas where available (required inside a worker), else a detached <canvas>.
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ---------------------------------------------------------------- MP4 (ISO BMFF) writer
  const enc = new TextEncoder();
  const concat = (parts) => {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
  const i32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v); return b; };
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; };
  const u8 = (...v) => Uint8Array.from(v);
  const str = (s) => enc.encode(s);
  const box = (type, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), str(type), body]); };
  const full = (type, version, flags, ...parts) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
  const MATRIX = concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

  function sampleEntry(kind, width, height, config) {
    const name = new Uint8Array(32);
    return box(kind,
      new Uint8Array(6), u16(1), // reserved, data_reference_index
      u16(0), u16(0), u32(0), u32(0), u32(0),
      u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
      name, u16(0x0018), u16(0xffff),
      config);
  }

  // samples: [{ data, key, pts }] in decode order; timescale ticks per second; delta ticks per frame.
  function mux({ kind, config, width, height, samples, timescale, delta }) {
    const n = samples.length;
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str(kind === 'avc1' ? 'avc1' : 'mp41'), str('mp41'));
    const payload = concat(samples.map((s) => s.data));
    const mdat = concat([u32(payload.length + 8), str('mdat'), payload]);
    const dataOffset = ftyp.length + 8;
    const durTicks = n * delta, durMs = Math.round((durTicks * 1000) / timescale);

    const offsets = samples.map((s, i) => s.pts - i * delta);
    const needCtts = offsets.some((o) => o !== 0);
    const stbl = box('stbl',
      full('stsd', 0, 0, u32(1), sampleEntry(kind, width, height, config)),
      full('stts', 0, 0, u32(1), u32(n), u32(delta)),
      needCtts ? full('ctts', 1, 0, u32(n), ...offsets.flatMap((o) => [u32(1), i32(o)])) : new Uint8Array(0),
      full('stss', 0, 0, u32(samples.filter((s) => s.key).length), ...samples.map((s, i) => (s.key ? u32(i + 1) : null)).filter(Boolean)),
      full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
      full('stsz', 0, 0, u32(0), u32(n), ...samples.map((s) => u32(s.data.length))),
      full('stco', 0, 0, u32(1), u32(dataOffset)));
    const moov = box('moov',
      full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX,
        u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2)),
      box('trak',
        full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX,
          u32(width * 65536), u32(height * 65536)),
        box('mdia',
          full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(durTicks), u16(0x55c4), u16(0)),
          full('hdlr', 0, 0, u32(0), str('vide'), u32(0), u32(0), u32(0), str('Mathsim video\0')),
          box('minf',
            full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
            box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
            stbl))));
    return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
  }

  // VP9 codec configuration box for MP4 (profile 0, 8-bit 4:2:0, BT.709).
  const vpcC = () => full('vpcC', 1, 0, u8(0, 40, (8 << 4) | (1 << 1), 1, 1, 1), u16(0));

  // ---------------------------------------------------------------- recording
  // opts: { width, height, fps, frames, bitrate, drawFrame: async (i, t) => CanvasImageSource (null ends the video early),
  //         onProgress(frac, i), isCancelled() }
  async function record(opts) {
    if (!supported()) throw new Error('video encoding (WebCodecs) is not available here — use the desktop app or Chrome/Edge');
    const width = opts.width & ~1, height = opts.height & ~1;
    const fps = opts.fps || 30;
    const bitrate = opts.bitrate || Math.round(width * height * fps * 0.15);
    const candidates = [
      ...['avc1.640034', 'avc1.4d0034', 'avc1.420034', 'avc1.640033', 'avc1.640028', 'avc1.42001f'].map((codec) => ({ codec, kind: 'avc1', extra: { avc: { format: 'avc' } } })),
      { codec: 'vp09.00.40.08', kind: 'vp09', extra: {} },
    ];
    let chosen = null;
    for (const c of candidates) {
      const config = Object.assign({ codec: c.codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' }, c.extra);
      try {
        const s = await VideoEncoder.isConfigSupported(config);
        if (s.supported) { chosen = { config, kind: c.kind }; break; }
      } catch { /* try next */ }
    }
    if (!chosen) throw new Error(`this computer can't encode ${width}×${height} MP4 video (no H.264 or VP9 encoder)`);

    const timescale = fps * 1000, delta = 1000;
    const samples = [];
    let description = null, failure = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', pts: Math.round((chunk.timestamp * timescale) / 1e6) });
        const d = meta && meta.decoderConfig && meta.decoderConfig.description;
        if (d && !description) description = d instanceof ArrayBuffer ? new Uint8Array(d).slice() : new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice();
      },
      error: (e) => { failure = e; },
    });
    encoder.configure(chosen.config);

    const tmp = makeCanvas(width, height);
    const tctx = tmp.getContext('2d');
    const keyEvery = fps * 2;
    try {
      for (let i = 0; i < opts.frames; i++) {
        if (opts.isCancelled && opts.isCancelled()) throw new Error('cancelled');
        if (failure) throw failure;
        const t = opts.frames > 1 ? i / (opts.frames - 1) : 1;
        const src = await opts.drawFrame(i, t);
        if (!src) break;
        tctx.drawImage(src, 0, 0, width, height);
        const frame = new VideoFrame(tmp, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
        frame.close();
        // Wait for the encoder to catch up. The 'dequeue' event (and the MessageChannel fallback) keep
        // working at full speed when the window is minimized, unlike timers.
        while (encoder.encodeQueueSize > 4 && !failure && encoder.state === 'configured') {
          if ('ondequeue' in encoder) {
            await Promise.race([
              new Promise((r) => encoder.addEventListener('dequeue', r, { once: true })),
              new Promise((r) => setTimeout(r, 250)), // safety net only
            ]);
          } else await U.yieldNow();
        }
        if (opts.onProgress) opts.onProgress((i + 1) / opts.frames, i);
      }
      await encoder.flush();
      if (failure) throw failure;
    } finally {
      if (encoder.state !== 'closed') encoder.close();
    }
    if (chosen.kind === 'avc1' && !description) throw new Error('the H.264 encoder gave no configuration data');
    const config = chosen.kind === 'avc1' ? box('avcC', description) : vpcC();
    return mux({ kind: chosen.kind, config, width, height, samples, timescale, delta });
  }

  // ---------------------------------------------------------------- zoom video (all types)
  // Self-contained so it runs the same in the background worker (js/videoworker.js) or on the page.
  // job: { def, view (serialized target view), o: { secs, fps, w, h, start, spin, smooth, aa, detail },
  //        autoIter, smartAA, time, pxScale }
  // hooks: { onStatus(text, frac), isCancelled() }
  async function renderZoom(job, hooks = {}) {
    const { def, o } = job;
    const status = hooks.onStatus || (() => {});
    const frames = Math.max(2, Math.round(o.secs * o.fps));
    const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    const e = (t) => (o.smooth ? ease(t) : t);
    const w = o.w & ~1, h = o.h & ~1;
    const rw = Math.max(2, Math.round(w * (o.detail || 1))), rh = Math.max(2, Math.round(h * (o.detail || 1)));
    const cleanups = [];
    const target = HP.fromView(job.view);
    const L1 = target.L;
    const L0 = def.type === '3d' ? 0 : (() => { const m = HP.parseMag(o.start); return m != null && isFinite(m) ? m : L1 + 10; })();
    const rad = (o.spin * Math.PI) / 180;
    const viewAt = (t) => {
      const pv = HP.clone(target);
      pv.L = L0 + (L1 - L0) * e(t);
      pv.rot = target.rot - rad * (1 - e(t));
      return pv;
    };
    try {
      let drawFrame;
      if (def.type === 'escape') {
        const cv = makeCanvas(rw, rh);
        const r = new EscapeGL.EscapeRenderer(cv, true);
        cleanups.push(() => r.dispose());
        // Every frame shares the same centre, so one reference orbit — computed for the deepest frame —
        // serves the whole video; only the small BLA table is rebuilt as the zoom deepens.
        const deepest = L0 < L1 ? viewAt(0) : viewAt(1);
        const an = Deep.analyze(def);
        if (deepest.L < EscapeGL.DEEP_L && an.ok) {
          status('Computing reference orbit for the deepest frame…', 0);
          await U.yieldNow();
          r.core.syncRef(def, an, deepest, Defs.effIter(def, deepest.L, job.autoIter));
        }
        let prevIter = 0;
        drawFrame = async (i, t) => {
          const pv = viewAt(t);
          const rule = Defs.effIter(def, pv.L, true);
          let maxIter = Math.max(1, Math.round(def.maxIter));
          if (job.autoIter) {
            // measure each frame, but don't let the limit drop sharply between frames (avoids flicker)
            const cap = Math.min(150000, Math.max(rule * 3, prevIter * 3, 3000));
            const measured = r.probe(def, pv, cap, rw / rh, rule) ?? rule;
            maxIter = Math.max(measured, Math.round(prevIter * 0.8));
            prevIter = maxIter;
          }
          await r.drawFull(def, pv, { aa: o.aa, time: job.time, maxIter, adaptive: job.smartAA });
          return cv;
        };
      } else if (def.type === 'vector') {
        const cv = makeCanvas(w, h);
        const ctx = cv.getContext('2d');
        drawFrame = async (i, t) => { Vec.draw(ctx, def, HP.approx(viewAt(t)), w, h, job.pxScale || 1); return cv; };
      } else if (def.type === 'ifs' || def.type === 'attractor') {
        const cv = makeCanvas(w, h);
        const ctx = cv.getContext('2d');
        const st = IFS.createAccum(w, h), img = ctx.createImageData(w, h), prep = IFS.prepare(def);
        drawFrame = async (i, t) => {
          IFS.reset(st, HP.approx(viewAt(t)), prep);
          const need = w * h * 6;
          while (st.total < need) { IFS.iterate(st, 200000); if (st.total < need) await U.yieldNow(); }
          IFS.toImage(st, def, img);
          ctx.putImageData(img, 0, 0);
          return cv;
        };
      } else {
        const cv = makeCanvas(rw, rh);
        const r = new F3D.Renderer(cv, { preserve: true });
        cleanups.push(() => r.dispose());
        const cam1 = Object.assign({}, def.camera);
        const far = Math.max(1, parseFloat(o.start) || 5);
        drawFrame = async (i, t) => {
          const cam = Object.assign({}, cam1, { dist: cam1.dist * far ** (1 - e(t)), yaw: cam1.yaw - o.spin * (1 - e(t)) });
          await F3D.drawStrips(r, def, cam);
          return cv;
        };
      }
      const t0 = performance.now();
      return await record({
        width: w, height: h, fps: o.fps, frames, drawFrame,
        isCancelled: hooks.isCancelled,
        onProgress: (frac, i) => {
          const el = (performance.now() - t0) / 1000;
          const eta = frac > 0 ? el / frac - el : 0;
          status(`Frame ${i + 1} / ${frames} · about ${eta > 90 ? Math.round(eta / 60) + ' min' : Math.round(eta) + ' s'} left`, frac);
        },
      });
    } finally {
      cleanups.forEach((f) => f());
    }
  }

  return { supported, record, renderZoom, makeCanvas };
})();
