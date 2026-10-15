// Vector fractals drawn with true lines and circular arcs (crisp at any zoom, exportable as SVG).
//
// kind 'kuschnig': a unit circle split into four 90° arcs, plus each of those arcs mirrored across its
//   own chord (centred on the corners of the bounding square), which forms a four-pointed star. Every arc
//   spawns two smaller arcs with the same orientation, meeting at the split point on the mother's chord.
//
// kind 'rules': a general "generator" system. Every piece lives in its own frame running from (0,0) to
//   (1,0), with +y pointing to its left. It is drawn as a line or an arc with a given bulge angle. Each rule
//   places a child piece by its start and end point in that frame (optionally mirrored), so Koch curves,
//   dragons, trees and the Kuschnig construction are all just different rule lists.
const Vec = (() => {
  const Q = Math.PI / 2;
  const TAU = Math.PI * 2;
  const COS = [1, 0, -1, 0];
  const SIN = [0, 1, 0, -1];
  const MAX_ARCS = 600000; // safety cap per draw
  const S3 = Math.sqrt(3);

  function defaults() {
    return {
      type: 'vector',
      kind: 'kuschnig',
      name: 'Kuschnig Fractal',
      depth: 8,
      auto: false,
      split: 0.5,
      circle: true,
      star: true,
      showAll: true,
      lineWidth: 1.6,
      widthFalloff: 0.85,
      palette: ['#3a86ff', '#3a86ff'],
      background: '#05060a',
      view: { cx: 0, cy: 0, scale: 1.15, rot: 0 },
      // used by kind 'rules'
      motif: 'line',
      bulge: 90,
      seeds: [[-1, 0, 1, 0]],
      rules: [],
    };
  }

  // ---------------------------------------------------------------- rule templates
  const R = (x0, y0, x1, y1, flip = false) => ({ x0, y0, x1, y1, flip });
  const kochRules = [R(0, 0, 1 / 3, 0), R(1 / 3, 0, 0.5, S3 / 6), R(0.5, S3 / 6, 2 / 3, 0), R(2 / 3, 0, 1, 0)];
  const TEMPLATES = {
    'Koch snowflake': { motif: 'line', seeds: [[0, 0.577, 0.5, -0.289], [0.5, -0.289, -0.5, -0.289], [-0.5, -0.289, 0, 0.577]], rules: kochRules, depth: 5, showAll: false, view: { cx: 0, cy: 0, scale: 0.75, rot: 0 } },
    'Koch curve': { motif: 'line', seeds: [[-1, -0.25, 1, -0.25]], rules: kochRules, depth: 5, showAll: false, view: { cx: 0, cy: 0, scale: 0.6, rot: 0 } },
    'Arc Koch': { motif: 'arc', bulge: 60, seeds: [[0, 0.577, 0.5, -0.289], [0.5, -0.289, -0.5, -0.289], [-0.5, -0.289, 0, 0.577]], rules: kochRules, depth: 4, showAll: true, view: { cx: 0, cy: 0, scale: 0.8, rot: 0 } },
    'Quadratic Koch': {
      motif: 'line', seeds: [[-0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, -0.5], [0.5, -0.5, -0.5, -0.5], [-0.5, -0.5, -0.5, 0.5]],
      rules: [R(0, 0, 1 / 3, 0), R(1 / 3, 0, 1 / 3, 1 / 3), R(1 / 3, 1 / 3, 2 / 3, 1 / 3), R(2 / 3, 1 / 3, 2 / 3, 0), R(2 / 3, 0, 1, 0)],
      depth: 4, showAll: false, view: { cx: 0, cy: 0, scale: 0.85, rot: 0 },
    },
    'Minkowski sausage': {
      motif: 'line', seeds: [[-1, 0, 1, 0]],
      rules: [R(0, 0, 0.25, 0), R(0.25, 0, 0.25, 0.25), R(0.25, 0.25, 0.5, 0.25), R(0.5, 0.25, 0.5, 0), R(0.5, 0, 0.5, -0.25), R(0.5, -0.25, 0.75, -0.25), R(0.75, -0.25, 0.75, 0), R(0.75, 0, 1, 0)],
      depth: 4, showAll: false, view: { cx: 0, cy: 0, scale: 0.85, rot: 0 },
    },
    'Lévy C curve': { motif: 'line', seeds: [[-0.5, -0.3, 0.5, -0.3]], rules: [R(0, 0, 0.5, 0.5), R(0.5, 0.5, 1, 0)], depth: 13, showAll: false, view: { cx: 0, cy: 0.05, scale: 0.7, rot: 0 } },
    'Heighway dragon': { motif: 'line', seeds: [[-0.5, 0, 0.5, 0]], rules: [R(0, 0, 0.5, 0.5), R(1, 0, 0.5, 0.5)], depth: 13, showAll: false, view: { cx: -0.05, cy: 0.1, scale: 0.6, rot: 0 } },
    'Sierpinski arrowhead': {
      motif: 'line', seeds: [[-0.5, -0.4, 0.5, -0.4]],
      rules: [R(0, 0, 0.25, S3 / 4, true), R(0.25, S3 / 4, 0.75, S3 / 4), R(0.75, S3 / 4, 1, 0, true)],
      depth: 7, showAll: false, view: { cx: 0, cy: 0, scale: 0.55, rot: 0 },
    },
    'Fractal tree': {
      motif: 'line', seeds: [[0, -1, 0, -0.35]],
      rules: [R(1, 0, 1 + 0.62 * Math.cos(0.6), 0.62 * Math.sin(0.6)), R(1, 0, 1 + 0.62 * Math.cos(0.6), -0.62 * Math.sin(0.6))],
      depth: 11, showAll: true, lineWidth: 5, widthFalloff: 0.72, view: { cx: 0, cy: 0.05, scale: 1.1, rot: 0 },
    },
    'Kuschnig (as rules)': {
      motif: 'arc', bulge: 90,
      seeds: [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]],
      rules: [R(0, 0, 0.5, 0), R(0.5, 0, 1, 0)], depth: 8, showAll: true, view: { cx: 0, cy: 0, scale: 1.15, rot: 0 },
    },
    'Arc flower': {
      motif: 'arc', bulge: 120,
      seeds: [0, 1, 2, 3, 4, 5].map((i) => { const a = (i * Math.PI) / 3, b = ((i + 1) * Math.PI) / 3; return [Math.cos(b), Math.sin(b), Math.cos(a), Math.sin(a)]; }),
      rules: [R(0, 0, 1 / 3, 0), R(1 / 3, 0, 2 / 3, 0, true), R(2 / 3, 0, 1, 0)], depth: 5, showAll: true, view: { cx: 0, cy: 0, scale: 1.3, rot: 0 },
    },
  };

  function fromTemplate(name) {
    const t = TEMPLATES[name] || TEMPLATES['Koch snowflake'];
    return Object.assign(defaults(), { kind: 'rules', name, lineWidth: 1.4, widthFalloff: 0.9 }, U.clone(t));
  }

  // ---------------------------------------------------------------- kuschnig walker
  // An arc is [centreX, centreY, radius, o]: a quarter circle from angle o·90° to (o+1)·90°, counter-clockwise.
  function baseArcs(def) {
    const out = [];
    for (let o = 0; o < 4; o++) {
      if (def.circle) out.push([0, 0, 1, o]);
      // Mirror across the chord: centre moves to the square's corner, arc turns 180°.
      if (def.star) out.push([COS[o] + COS[(o + 1) % 4], SIN[o] + SIN[(o + 1) % 4], 1, (o + 2) % 4]);
    }
    return out;
  }

  function screenMap(view, W, H) {
    const k = H / 2 / view.scale;
    const rot = view.rot || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const vcx = view.cx, vcy = view.cy;
    return {
      k, rot,
      sx: (x, y) => W / 2 + ((x - vcx) * cr + (y - vcy) * sr) * k,
      sy: (x, y) => H / 2 - (-(x - vcx) * sr + (y - vcy) * cr) * k,
    };
  }

  function walkKuschnig(def, view, opts, sink) {
    const { W, H } = opts;
    const px = opts.px || 1;
    const { k, rot, sx, sy } = screenMap(view, W, H);
    const s1 = U.clamp(+def.split || 0.5, 0.02, 0.98), s2 = 1 - s1;
    const maxDepth = def.auto ? 64 : U.clamp(Math.round(def.depth), 0, 24);
    const minR = def.auto ? 0.6 : 0.35; // below this many pixels, a subtree is drawn as its chord
    const pad = (def.lineWidth || 1) * px * 2;
    const maxArcs = opts.maxArcs || MAX_ARCS;

    const stack = baseArcs(def).map((a) => [...a, 0]);
    let drawn = 0, deepest = 0, truncated = false;
    while (stack.length) {
      const [cx, cy, r, o, d] = stack.pop();
      const x0 = cx + r * COS[o], y0 = cy + r * SIN[o];
      const o1 = (o + 1) % 4;
      const x1 = cx + r * COS[o1], y1 = cy + r * SIN[o1];
      // Every descendant stays inside the box spanned by the two endpoints: cull the whole subtree.
      const bx = (x0 + x1) / 2, by = (y0 + y1) / 2;
      const bsx = sx(bx, by), bsy = sy(bx, by);
      const rad = (Math.hypot(x1 - x0, y1 - y0) / 2) * k + pad;
      if (bsx < -rad || bsx > W + rad || bsy < -rad || bsy > H + rad) continue;
      if (drawn >= maxArcs) { truncated = true; break; }
      const rp = r * k;
      const leaf = d >= maxDepth || rp < minR;
      if (d > deepest) deepest = d;
      if (rp < minR) {
        // Sub-pixel: the chain of descendants converges on the chord, so draw that.
        sink.line(d, sx(x0, y0), sy(x0, y0), sx(x1, y1), sy(x1, y1));
      } else if (def.showAll || leaf) {
        // Screen angles: undo view rotation and flip y (canvas y points down).
        const a0 = -(o * Q - rot), a1 = -((o + 1) * Q - rot);
        sink.arc(d, sx(cx, cy), sy(cx, cy), rp, a0, a1, sx(x0, y0), sy(x0, y0), sx(x1, y1), sy(x1, y1), true, false);
      }
      drawn++;
      if (leaf) continue;
      stack.push([x1 + s2 * (cx - x1), y1 + s2 * (cy - y1), s2 * r, o, d + 1]);
      stack.push([x0 + s1 * (cx - x0), y0 + s1 * (cy - y0), s1 * r, o, d + 1]);
    }
    return { drawn, deepest, truncated };
  }

  // ---------------------------------------------------------------- rules walker
  // Motif geometry in the unit frame, plus a radius that bounds the whole limit shape (for culling).
  const prepCache = new Map();
  function prepRules(def) {
    const key = JSON.stringify([def.motif, def.bulge, def.rules]);
    if (prepCache.has(key)) return prepCache.get(key);
    const th = ((+def.bulge || 0) * Math.PI) / 180;
    const arc = def.motif === 'arc' && Math.abs(th) > 1e-3 && Math.abs(th) < TAU - 1e-3;
    const m = { arc, large: Math.abs(th) > Math.PI };
    let rm = 0.5;
    if (arc) {
      m.cx = 0.5;
      m.cy = -0.5 / Math.tan(th / 2);
      m.r = 0.5 / Math.abs(Math.sin(th / 2));
      m.topY = m.cy + Math.sign(th) * m.r;
      // farthest point of the arc from the chord midpoint (sampled)
      const a0 = Math.atan2(0 - m.cy, 0 - 0.5), sweep = -th; // from start, through the bulge
      for (let i = 0; i <= 64; i++) {
        const a = a0 + (sweep * i) / 64;
        rm = Math.max(rm, Math.hypot(m.cx + m.r * Math.cos(a) - 0.5, m.cy + m.r * Math.sin(a)));
      }
    }
    const rules = (def.rules || []).map((r) => ({ x0: +r.x0 || 0, y0: +r.y0 || 0, x1: +r.x1 || 0, y1: +r.y1 || 0, flip: !!r.flip }));
    let bound = rm;
    const smax = Math.max(0, ...rules.map((r) => Math.hypot(r.x1 - r.x0, r.y1 - r.y0)));
    if (smax >= 0.999) bound = Infinity;
    else {
      for (let it = 0; it < 400; it++) {
        let b = rm;
        for (const r of rules) {
          const s = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
          const d = Math.hypot((r.x0 + r.x1) / 2 - 0.5, (r.y0 + r.y1) / 2);
          b = Math.max(b, d + s * bound);
        }
        if (Math.abs(b - bound) < 1e-9) { bound = b; break; }
        bound = b;
      }
    }
    const res = { m, rules, bound, smax };
    if (prepCache.size > 30) prepCache.clear();
    prepCache.set(key, res);
    return res;
  }

  const norm = (x) => ((x % TAU) + TAU) % TAU;

  function walkRules(def, view, opts, sink) {
    const { W, H } = opts;
    const px = opts.px || 1;
    const { k, sx, sy } = screenMap(view, W, H);
    const { m, rules, bound } = prepRules(def);
    const maxDepth = def.auto ? 60 : U.clamp(Math.round(def.depth), 0, 30);
    const minPx = def.auto ? 1 : 0.25;
    const pad = (def.lineWidth || 1) * px * 2;
    const maxArcs = opts.maxArcs || MAX_ARCS;
    const stack = (def.seeds || []).map((s) => [+s[0], +s[1], +s[2], +s[3], false, 0]);
    let drawn = 0, deepest = 0, truncated = false;
    while (stack.length) {
      const [ax, ay, bx, by, fl, d] = stack.pop();
      const ux = bx - ax, uy = by - ay;
      const len = Math.hypot(ux, uy);
      if (!(len > 0)) continue;
      // v: the frame's +y axis (left of the direction of travel, or right when mirrored)
      const vx = fl ? uy : -uy, vy = fl ? -ux : ux;
      if (isFinite(bound)) {
        const msx = sx(ax + ux / 2, ay + uy / 2), msy = sy(ax + ux / 2, ay + uy / 2);
        const rad = bound * len * k + pad;
        if (msx < -rad || msx > W + rad || msy < -rad || msy > H + rad) continue;
      }
      if (drawn >= maxArcs) { truncated = true; break; }
      const lp = len * k;
      const leaf = d >= maxDepth || lp < minPx || !rules.length;
      if (d > deepest) deepest = d;
      if (def.showAll || leaf) {
        const sAx = sx(ax, ay), sAy = sy(ax, ay), sBx = sx(bx, by), sBy = sy(bx, by);
        if (!m.arc || lp < 1.5) sink.line(d, sAx, sAy, sBx, sBy);
        else {
          const wx = ax + m.cx * ux + m.cy * vx, wy = ay + m.cx * uy + m.cy * vy;
          const tx = ax + 0.5 * ux + m.topY * vx, ty = ay + 0.5 * uy + m.topY * vy;
          const cX = sx(wx, wy), cY = sy(wx, wy);
          const a0 = Math.atan2(sAy - cY, sAx - cX), a1 = Math.atan2(sBy - cY, sBx - cX);
          const am = Math.atan2(sy(tx, ty) - cY, sx(tx, ty) - cX);
          const cw = norm(am - a0) < norm(a1 - a0);
          sink.arc(d, cX, cY, m.r * lp, a0, a1, sAx, sAy, sBx, sBy, !cw, m.large);
        }
      }
      drawn++;
      if (leaf) continue;
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        stack.push([
          ax + r.x0 * ux + r.y0 * vx, ay + r.x0 * uy + r.y0 * vy,
          ax + r.x1 * ux + r.y1 * vx, ay + r.x1 * uy + r.y1 * vy,
          fl !== r.flip, d + 1,
        ]);
      }
    }
    return { drawn, deepest, truncated };
  }

  const walk = (def, view, opts, sink) => (def.kind === 'rules' ? walkRules : walkKuschnig)(def, view, opts, sink);

  // ---------------------------------------------------------------- drawing
  function paletteAt(pal, t) {
    const cols = (pal && pal.length ? pal : ['#ffffff']).map(U.hexToRgb);
    if (cols.length === 1) return U.rgbToHex(...cols[0]);
    const x = U.clamp(t, 0, 1) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(x));
    const f = x - i, a = cols[i], b = cols[i + 1];
    return U.rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }

  // Colour and stroke width per depth level.
  function styleFor(def, d, span, px) {
    return {
      color: paletteAt(def.palette, span ? d / span : 0),
      width: Math.max(0.35, (def.lineWidth || 1) * px * Math.pow(def.widthFalloff ?? 0.85, d)),
    };
  }

  // Draws onto a 2D canvas context of size W×H.
  function draw(ctx, def, view, W, H, px = 1) {
    const paths = [];
    const get = (d) => paths[d] || (paths[d] = new Path2D());
    const sink = {
      arc(d, x, y, r, a0, a1, xs, ys, xe, ye, ccw) { const p = get(d); p.moveTo(xs, ys); p.arc(x, y, r, a0, a1, ccw); },
      line(d, x0, y0, x1, y1) { const p = get(d); p.moveTo(x0, y0); p.lineTo(x1, y1); },
    };
    const info = walk(def, view, { W, H, px }, sink);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = def.background || '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const span = def.auto ? Math.max(1, info.deepest) : Math.max(1, def.depth);
    paths.forEach((p, d) => {
      if (!p) return;
      const st = styleFor(def, d, span, px);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.stroke(p);
    });
    ctx.restore();
    return info;
  }

  // Standalone SVG document of the current view.
  function toSVG(def, view, W, H, px = 1) {
    const parts = [];
    const f = (v) => Math.round(v * 100) / 100;
    const get = (d) => parts[d] || (parts[d] = []);
    const sink = {
      // Canvas "anticlockwise" on a y-down screen is sweep-flag 0 in SVG.
      arc(d, x, y, r, a0, a1, xs, ys, xe, ye, ccw, large) {
        get(d).push(`M${f(xs)} ${f(ys)}A${f(r)} ${f(r)} 0 ${large ? 1 : 0} ${ccw ? 0 : 1} ${f(xe)} ${f(ye)}`);
      },
      line(d, x0, y0, x1, y1) { get(d).push(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`); },
    };
    const info = walk(def, view, { W, H, px, maxArcs: 250000 }, sink);
    const span = def.auto ? Math.max(1, info.deepest) : Math.max(1, def.depth);
    const body = parts.map((segs, d) => {
      if (!segs) return '';
      const st = styleFor(def, d, span, px);
      return `<path fill="none" stroke="${st.color}" stroke-width="${f(st.width)}" stroke-linecap="round" d="${segs.join('')}"/>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${String(def.name || 'Fractal').replace(/[<&>]/g, '')}</title>
<rect width="100%" height="100%" fill="${def.background || '#000'}"/>
${body}
</svg>`;
  }

  // Small diagram of one generator step: the parent piece (grey) and where each rule puts its child.
  function drawGenerator(ctx, def, W, H) {
    const g = Object.assign({}, def, {
      kind: 'rules', seeds: [[0, 0, 1, 0]], depth: 1, auto: false, showAll: true,
      lineWidth: 2, widthFalloff: 1, palette: ['#5b6170', '#ff9f1c'], background: '#101218',
    });
    const xs = [0, 1], ys = [0, 0];
    const { m } = prepRules(g);
    if (m.arc) { ys.push(m.topY, m.cy - m.r, m.cy + m.r); xs.push(0.5 - m.r, 0.5 + m.r); }
    for (const r of g.rules || []) { xs.push(r.x0, r.x1); ys.push(r.y0, r.y1, r.y0 + 0.4, r.y0 - 0.4); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.max(-2, Math.min(...ys)), maxY = Math.min(2, Math.max(...ys));
    const scale = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / (W / H)) * 1.2 || 1;
    const view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale, rot: 0 };
    draw(ctx, g, view, W, H, 1);
    // dots mark where each child starts, so its direction is visible
    const { sx, sy } = screenMap(view, W, H);
    ctx.fillStyle = '#ffd166';
    for (const r of g.rules || []) {
      ctx.beginPath();
      ctx.arc(sx(r.x0, r.y0), sy(r.x0, r.y0), 3, 0, TAU);
      ctx.fill();
    }
  }

  function random() {
    if (Math.random() < 0.4) {
      return Object.assign(defaults(), {
        name: 'Random Kuschnig',
        depth: 6 + Math.floor(Math.random() * 6),
        split: +U.rand(0.3, 0.7).toFixed(3),
        star: Math.random() < 0.8,
        showAll: Math.random() < 0.7,
        widthFalloff: +U.rand(0.7, 0.95).toFixed(2),
      });
    }
    // Random generator: 2–4 contracting pieces roughly along the chord.
    const n = 2 + Math.floor(Math.random() * 3);
    const rules = [];
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      const nx = i === n - 1 ? 1 : (i + 1) / n + U.rand(-0.1, 0.1);
      const ny = i === n - 1 ? 0 : U.rand(-0.35, 0.35);
      rules.push(R(+x.toFixed(3), +y.toFixed(3), +nx.toFixed(3), +ny.toFixed(3), Math.random() < 0.25));
      x = nx; y = ny;
    }
    if (rules.some((r) => Math.hypot(r.x1 - r.x0, r.y1 - r.y0) >= 0.95)) return random();
    const motif = Math.random() < 0.5 ? 'arc' : 'line';
    return Object.assign(defaults(), {
      kind: 'rules', name: 'Random generator', motif, bulge: Math.round(U.rand(-150, 150)),
      seeds: [[-1, 0, 1, 0]], rules, depth: n > 3 ? 5 : 8, showAll: Math.random() < 0.5,
      lineWidth: 1.4, widthFalloff: 0.9, view: { cx: 0, cy: 0, scale: 1.1, rot: 0 },
    });
  }

  return { defaults, draw, toSVG, random, walk, drawGenerator, fromTemplate, TEMPLATES };
})();
