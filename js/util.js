// Small DOM + math helpers shared by every module.
const U = (() => {
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  function hexToRgb(h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function rgbToHex(r, g, b) {
    const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return rgbToHex(f(0), f(8), f(4));
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function debounce(fn, ms) {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function download(blob, name) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  // Lets the UI update between chunks of long work. Unlike requestAnimationFrame/setTimeout this isn't
  // throttled when the window is in the background.
  const yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  const yieldQueue = [];
  if (yieldChannel) yieldChannel.port1.onmessage = () => { const f = yieldQueue.shift(); if (f) f(); };
  const yieldNow = () => new Promise((r) => {
    if (!yieldChannel) return setTimeout(r, 0);
    yieldQueue.push(r);
    yieldChannel.port2.postMessage(0);
  });

  function fmtNum(v, prec = 6) {
    if (v == null || !isFinite(v)) return '';
    return String(+(+v).toPrecision(prec));
  }

  function fmtBig(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  }

  function safeName(s) {
    return String(s || 'fractal').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'fractal';
  }

  // In-page replacement for window.prompt (which Electron doesn't support). Resolves to text or null.
  function ask(title, value = '') {
    return new Promise((resolve) => {
      const input = el('input', { type: 'text', class: 'mono', value, spellcheck: 'false' });
      const close = (v) => { back.remove(); resolve(v); };
      const back = el('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(null); } },
        el('form', {
          class: 'modal',
          onsubmit: (e) => { e.preventDefault(); close(input.value); },
          onkeydown: (e) => { if (e.key === 'Escape') close(null); },
        },
          el('div', { class: 'modal-title' }, title),
          input,
          el('div', { class: 'btn-row' },
            el('button', { type: 'button', onclick: () => close(null) }, 'Cancel'),
            el('button', { type: 'submit', class: 'primary' }, 'OK'))));
      document.body.append(back);
      input.focus();
      input.select();
    });
  }

  return { el, ask, hexToRgb, rgbToHex, hslToHex, clone, clamp, rand, pick, uid, debounce, toast, download, nextFrame, yieldNow, fmtNum, fmtBig, safeName };
})();
