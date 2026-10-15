// Arbitrary-precision view coordinates.
// A precise view ("pv") is { x, y: BigInt fixed-point with P fractional bits, P, L: log2(scale), rot }.
// `scale` is half the viewport height in plane units, so zoom depth is only limited by memory.
const HP = (() => {
  const LOG2_10 = Math.log2(10);

  function ldexp(m, e) {
    while (e > 1000) { m *= 2 ** 1000; e -= 1000; }
    while (e < -1000) { m *= 2 ** -1000; e += 1000; }
    return m * 2 ** e;
  }

  function bitLen(n) {
    if (n < 0n) n = -n;
    if (n === 0n) return 0;
    const h = n.toString(16);
    return (h.length - 1) * 4 + (32 - Math.clz32(parseInt(h[0], 16)));
  }

  // Precision needed so a pixel at this zoom is still resolved, with headroom.
  const neededP = (L) => Math.max(64, Math.ceil((-L + 48) / 32) * 32);

  // m * 2^e as fixed-point with P bits (m, e doubles; e may be fractional).
  function fixFrom(m, e, P) {
    if (!m || !isFinite(m)) return 0n;
    const total = e + P;
    const ei = Math.floor(total);
    const v = m * 2 ** (total - ei);
    const ev = Math.floor(Math.log2(Math.abs(v)));
    const s = 52 - ev;
    const iv = BigInt(Math.round(ldexp(v, s)));
    const shift = ei - s;
    return shift >= 0 ? iv << BigInt(shift) : iv >> BigInt(-shift);
  }

  const fromDouble = (d, P) => fixFrom(d, 0, P);

  // n * 2^(-P - L) as a double, without overflow for huge P.
  function toScaled(n, P, L = 0) {
    if (n === 0n) return 0;
    const sh = Math.max(0, bitLen(n) - 62);
    return ldexp(Number(n >> BigInt(sh)), sh - P - L);
  }

  function fromDecimal(str, P) {
    const m = /^\s*([+-])?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?\s*$/i.exec(String(str));
    if (!m || (!m[2] && !m[3])) return null;
    const frac = m[3] || '';
    const exp = parseInt(m[4] || '0', 10) - frac.length;
    const digits = BigInt((m[2] || '') + frac || '0');
    let n;
    if (exp >= 0) n = (digits * 10n ** BigInt(exp)) << BigInt(P);
    else {
      const div = 10n ** BigInt(-exp);
      n = ((digits << BigInt(P)) + div / 2n) / div;
    }
    return m[1] === '-' ? -n : n;
  }

  function toDecimal(n, P, digits) {
    const neg = n < 0n;
    if (neg) n = -n;
    let ip = n >> BigInt(P);
    const fracBits = n - (ip << BigInt(P));
    const scale = 10n ** BigInt(digits);
    let f = (fracBits * scale + (1n << BigInt(P - 1))) >> BigInt(P);
    if (f >= scale) { ip += 1n; f -= scale; }
    const fs = f.toString().padStart(digits, '0').replace(/0+$/, '');
    const s = ip.toString() + (fs ? '.' + fs : '');
    return (neg && s !== '0' ? '-' : '') + s;
  }

  // Scale values may be numbers or strings like "1.5e-800" (beyond double range).
  function parseLog2(v) {
    if (typeof v === 'number') return v > 0 ? Math.log2(v) : 0;
    const m = /^\s*(\d*\.?\d*)(?:e([+-]?\d+))?\s*$/i.exec(String(v));
    if (!m || !parseFloat(m[1])) return 0;
    return Math.log2(parseFloat(m[1])) + parseInt(m[2] || '0', 10) * LOG2_10;
  }

  function log2ToString(L) {
    const l10 = L / LOG2_10;
    const e = Math.floor(l10);
    return `${(10 ** (l10 - e)).toFixed(8)}e${e}`;
  }

  function parseCoord(v, P) {
    if (typeof v === 'number') return fromDouble(v, P);
    const n = fromDecimal(v, P);
    return n == null ? 0n : n;
  }

  function fromView(view) {
    const v = view || {};
    const L = parseLog2(v.scale ?? 1.5);
    const P = neededP(L);
    return { x: parseCoord(v.cx ?? 0, P), y: parseCoord(v.cy ?? 0, P), P, L, rot: +v.rot || 0 };
  }

  function toView(pv) {
    if (pv.L > -45) {
      return { cx: toScaled(pv.x, pv.P), cy: toScaled(pv.y, pv.P), scale: 2 ** pv.L, rot: pv.rot };
    }
    const digits = Math.ceil((-pv.L + 16) / LOG2_10);
    return {
      cx: toDecimal(pv.x, pv.P, digits),
      cy: toDecimal(pv.y, pv.P, digits),
      scale: pv.L > -1000 ? 2 ** pv.L : log2ToString(pv.L),
      rot: pv.rot,
    };
  }

  const approx = (pv) => ({ cx: toScaled(pv.x, pv.P), cy: toScaled(pv.y, pv.P), scale: ldexp(1, pv.L), rot: pv.rot });
  const clone = (pv) => ({ ...pv });

  function setP(pv, P2) {
    if (P2 === pv.P) return;
    const d = P2 - pv.P;
    pv.x = d > 0 ? pv.x << BigInt(d) : pv.x >> BigInt(-d);
    pv.y = d > 0 ? pv.y << BigInt(d) : pv.y >> BigInt(-d);
    pv.P = P2;
  }

  function ensureP(pv) {
    const need = neededP(pv.L);
    if (need > pv.P || need < pv.P - 128) setP(pv, need);
  }

  // Moves the centre by (mx, my) in units of the current scale (plane axes).
  function move(pv, mx, my) {
    pv.x += fixFrom(mx, pv.L, pv.P);
    pv.y += fixFrom(my, pv.L, pv.P);
  }

  // (a - b) in units of b's scale.
  function diff(a, b) {
    const P = Math.max(a.P, b.P);
    const ax = a.x << BigInt(P - a.P), ay = a.y << BigInt(P - a.P);
    const bx = b.x << BigInt(P - b.P), by = b.y << BigInt(P - b.P);
    return [toScaled(ax - bx, P, b.L), toScaled(ay - by, P, b.L)];
  }

  const same = (a, b) => a.x === b.x && a.y === b.y && a.P === b.P && a.L === b.L && a.rot === b.rot;

  function magString(L) {
    const l10 = -L / LOG2_10;
    if (l10 < 5) return String(+(2 ** -L).toPrecision(4));
    const e = Math.floor(l10);
    return `${(10 ** (l10 - e)).toFixed(2)}e${e}`;
  }

  // "1e500", "2.5e+80", "1000" -> log2(scale) for that magnification
  function parseMag(str) {
    const s = String(str).replace('+', '').replace(/[×x\s]/g, '');
    if (!/^(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) || !(parseFloat(s) > 0)) return null;
    return -parseLog2(s);
  }

  // Precise point under normalized screen position q (y up).
  function pointAt(pv, qx, qy) {
    const c = Math.cos(pv.rot), s = Math.sin(pv.rot);
    const p = clone(pv);
    move(p, qx * c - qy * s, qx * s + qy * c);
    return p;
  }

  return {
    LOG2_10, ldexp, bitLen, neededP, fixFrom, fromDouble, toScaled, fromDecimal, toDecimal,
    parseLog2, fromView, toView, approx, clone, setP, ensureP, move, diff, same, magString, parseMag, pointAt,
  };
})();
