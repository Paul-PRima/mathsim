// Reading data tables from files: CSV / TSV text and Excel .xlsx (first worksheet), plus a column picker.
// .xlsx files are ZIP archives of XML; they are unpacked with the browser's DecompressionStream.
const DataFile = (() => {
  // CSV with quotes; the separator (comma, semicolon or tab) is guessed from the first lines.
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
    const count = (c) => (sample.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
    const sep = ['\t', ';', ','].sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows;
  }

  // ---- minimal ZIP reader (central directory → deflated entries)
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a valid .xlsx file');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    const read = async (name) => {
      const f = files[name];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    };
    return { names: Object.keys(files), read };
  }
  async function parseXLSX(buf) {
    const z = await unzip(buf);
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const shared = [];
    const ss = await z.read('xl/sharedStrings.xml');
    if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    const sheetName = z.names.filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort()[0];
    if (!sheetName) throw new Error('No worksheet found in this file');
    const doc = xml(await z.read(sheetName));
    const rows = [];
    const colIndex = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
    for (const r of doc.getElementsByTagName('row')) {
      const out = [];
      for (const c of r.getElementsByTagName('c')) {
        const i = colIndex(c.getAttribute('r') || 'A'), type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let val = '';
        if (type === 's' && v) val = shared[+v.textContent] ?? '';
        else if (type === 'inlineStr') val = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
        else if (v) val = v.textContent;
        out[i] = val;
      }
      if (out.some((x) => x !== undefined && String(x).trim() !== '')) rows.push(Array.from(out, (x) => (x === undefined ? '' : x)));
    }
    return rows;
  }

  // Reads a File into { headers, columns: [[values]] }; the first row counts as headers if it isn't numeric.
  async function read(file) {
    const rows = /\.xlsx$/i.test(file.name) ? await parseXLSX(await file.arrayBuffer()) : parseCSV(await file.text());
    if (!rows.length) throw new Error('The file is empty');
    const width = Math.max(...rows.map((r) => r.length));
    const isNum = (s) => s !== '' && isFinite(Number(String(s).replace(',', '.')));
    const headerRow = rows[0].some((c) => c.trim() !== '' && !isNum(c.trim()));
    const headers = Array.from({ length: width }, (_, i) => (headerRow ? (rows[0][i] || '').trim() : '') || `Column ${i + 1}`);
    const body = headerRow ? rows.slice(1) : rows;
    const columns = headers.map((_, i) => body.map((r) => (r[i] ?? '').trim()));
    return { headers, columns };
  }
  const numbers = (col) => col.map((s) => Number(String(s).replace(',', '.'))).filter((v, i) => col[i] !== '' && isFinite(v));

  // Asks the user to choose columns. `slots` = labels for single choices (e.g. ['x', 'y']), or 'many'.
  function pickColumns(table, slots, title) {
    const { el } = U;
    return new Promise((resolve) => {
      const numericCols = table.headers.map((h, i) => ({ h, i, n: numbers(table.columns[i]).length })).filter((c) => c.n > 0);
      if (!numericCols.length) { U.toast('The file has no columns of numbers'); resolve(null); return; }
      const close = (v) => { back.remove(); resolve(v); };
      let body;
      const preview = (i) => `${table.headers[i]}  (${numbers(table.columns[i]).length} numbers: ${numbers(table.columns[i]).slice(0, 4).join(', ')}…)`;
      if (slots === 'many') {
        const boxes = numericCols.map((c) => { const b = el('input', { type: 'checkbox' }); b.checked = true; b.dataset.i = c.i; return el('label', { class: 'check' }, b, el('span', {}, preview(c.i))); });
        body = el('div', {}, boxes);
        body.value = () => boxes.map((l) => l.querySelector('input')).filter((b) => b.checked).map((b) => +b.dataset.i);
      } else {
        const sels = slots.map((s, k) => {
          const sel = el('select', {}, numericCols.map((c) => el('option', { value: c.i }, preview(c.i))));
          sel.value = numericCols[Math.min(k, numericCols.length - 1)].i;
          return el('label', { class: 'ctl' }, el('span', { class: 'ctl-label' }, s), sel);
        });
        body = el('div', {}, sels);
        body.value = () => sels.map((l) => +l.querySelector('select').value);
      }
      const back = el('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(null); } },
        el('div', { class: 'modal wide' }, el('div', { class: 'modal-title' }, title || 'Choose columns'), body,
          el('div', { class: 'btn-row' }, el('button', { type: 'button', onclick: () => close(null) }, 'Cancel'),
            el('button', { type: 'button', class: 'primary', onclick: () => close(body.value().map((i) => table.columns[i])) }, 'Use these'))));
      document.body.append(back);
    });
  }
  // A file input button: calls onTable(table) after reading the chosen file.
  function button(label, onTable) {
    const { el } = U;
    const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', hidden: true });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      input.value = '';
      if (!f) return;
      try { await onTable(await read(f)); } catch (e) { U.toast('Could not read the file: ' + e.message); }
    });
    return el('span', {}, input, el('button', { type: 'button', class: 'small', title: 'CSV or Excel (.xlsx)', onclick: () => input.click() }, label));
  }
  return { parseCSV, parseXLSX, read, numbers, pickColumns, button };
})();
