// Interface language. English is written in the code; German comes from a dictionary (js/i18n-de.js) that is
// applied to the page itself: text nodes and title / placeholder attributes are translated when they appear,
// and restored when switching back to English. Code, formulas and inputs are never touched.
const I18n = (() => {
  let lang = 'en';
  const DICT = { de: {} };       // English text → translation
  const PATTERNS = { de: [] };   // [RegExp, (match) => translation] for text with numbers in it
  const orig = new WeakMap();    // text node → its English text
  const SKIP = 'CODE, PRE, SCRIPT, STYLE, TEXTAREA, .mono, [data-no-i18n], .cx-history, .gx-input, .ex-math, .pr-math, .mx-show';
  let observer = null, busy = false;

  function add(language, entries, patterns = []) {
    Object.assign(DICT[language] || (DICT[language] = {}), entries);
    (PATTERNS[language] || (PATTERNS[language] = [])).push(...patterns);
  }

  // Translate one string (exact match on the trimmed text, keeping surrounding spaces).
  function t(s) {
    if (lang === 'en' || !s) return s;
    const key = s.trim();
    if (!key) return s;
    const d = DICT[lang] || {};
    if (d[key] !== undefined) return s.replace(key, d[key]);
    for (const [re, f] of PATTERNS[lang] || []) {
      const m = re.exec(key);
      if (m) return s.replace(key, typeof f === 'function' ? f(m) : key.replace(re, f));
    }
    return s;
  }

  function skipped(node) {
    const e = node.nodeType === 1 ? node : node.parentElement;
    return !e || !!e.closest(SKIP);
  }
  function doText(node) {
    if (!orig.has(node)) orig.set(node, node.nodeValue);
    const en = orig.get(node);
    // the page changed the text since we stored it: that is the new English
    if (node.nodeValue !== en && node.nodeValue !== t(en)) orig.set(node, node.nodeValue);
    const want = lang === 'en' ? orig.get(node) : t(orig.get(node));
    if (node.nodeValue !== want) node.nodeValue = want;
  }
  function doAttrs(e) {
    for (const a of ['title', 'placeholder', 'aria-label']) {
      if (!e.hasAttribute(a)) continue;
      const key = 'i18n' + a.replace('-', '');
      const cur = e.getAttribute(a);
      if (e.dataset[key] === undefined || (cur !== e.dataset[key] && cur !== t(e.dataset[key]))) e.dataset[key] = cur;
      const want = lang === 'en' ? e.dataset[key] : t(e.dataset[key]);
      if (cur !== want) e.setAttribute(a, want);
    }
  }
  function apply(root = document.body) {
    if (!root) return;
    busy = true;
    try {
      if (root.nodeType === 3) { if (!skipped(root)) doText(root); return; }
      if (root.nodeType !== 1 || skipped(root)) return;
      doAttrs(root);
      // elements matching SKIP are rejected together with everything inside them
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === 1) doAttrs(n);
        else if (n.nodeValue.trim()) doText(n);
      }
    } finally { busy = false; }
  }
  function watch() {
    if (observer) return;
    observer = new MutationObserver((list) => {
      if (busy) return;
      for (const m of list) {
        if (m.type === 'characterData') apply(m.target);
        else if (m.type === 'attributes') apply(m.target);
        else m.addedNodes.forEach((n) => apply(n));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
  }
  function setLang(l) {
    lang = DICT[l] || l === 'en' ? l : 'en';
    document.documentElement.lang = lang;
    apply(document.body);
    watch();
  }
  return { t, add, apply, setLang, get lang() { return lang; } };
})();
