// Note HTML can arrive from a backup file, the cloud or the clipboard, so it is
// reduced to a small allowlist before it is ever placed in the DOM.

const ALLOWED: Record<string, string[]> = {
  B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [],
  H1: [], H2: [], H3: [], P: [], DIV: [], BR: [], HR: [], SPAN: [],
  UL: ['class'], OL: [], LI: ['data-checked'],
  FONT: ['size', 'face', 'color'],
  A: ['href'], BLOCKQUOTE: [], PRE: [], CODE: [],
};

const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'SOURCE', 'HEAD', 'TITLE', 'BASE',
]);

const BLOCKS = new Set(['TABLE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'H4', 'H5', 'H6', 'DL', 'DT', 'DD', 'FIGURE']);

function attributeOk(tag: string, name: string, value: string): boolean {
  if (!ALLOWED[tag].includes(name)) return false;
  switch (name) {
    case 'class':
      return value === 'checklist';
    case 'data-checked':
      return value === 'true';
    case 'href':
      return /^(https?:|mailto:)/i.test(value.trim());
    case 'size':
      return /^[1-7]$/.test(value);
    case 'face':
      return /^[\w\s,"'-]{1,120}$/.test(value);
    case 'color':
      return /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(value);
  }
  return false;
}

function clean(node: Element, doc: Document) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) {
      child.remove();
      continue;
    }
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) {
      el.remove();
      continue;
    }
    clean(el, doc);
    if (!ALLOWED[tag]) {
      // Unknown element: keep its (already cleaned) content, drop the wrapper.
      if (BLOCKS.has(tag)) {
        const div = doc.createElement('div');
        div.append(...el.childNodes);
        el.replaceWith(div);
      } else el.replaceWith(...el.childNodes);
      continue;
    }
    for (const attr of [...el.attributes]) if (!attributeOk(tag, attr.name.toLowerCase(), attr.value)) el.removeAttribute(attr.name);
    if (tag === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  clean(doc.body, doc);
  return doc.body.innerHTML;
}
