import { escapeHtml, noteTitle } from './notes';
import { CONTENT_CSS } from './richtext';
import { sanitizeHtml } from './sanitize';
import type { Note } from './types';

function walk(node: Node, listDepth = 0): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node.nodeType !== 1) return '';
  const el = node as HTMLElement;
  const inner = () => [...el.childNodes].map((c) => walk(c, listDepth)).join('');
  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      return `**${inner()}**`;
    case 'I':
    case 'EM':
      return `*${inner()}*`;
    case 'S':
    case 'STRIKE':
      return `~~${inner()}~~`;
    case 'H1':
      return `\n# ${inner()}\n\n`;
    case 'H2':
      return `\n## ${inner()}\n\n`;
    case 'H3':
      return `\n### ${inner()}\n\n`;
    case 'BR':
      return '\n';
    case 'HR':
      return '\n---\n';
    case 'A':
      return `[${inner()}](${el.getAttribute('href') ?? ''})`;
    case 'BLOCKQUOTE':
      return `\n> ${inner().trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'UL':
    case 'OL': {
      const ordered = el.tagName === 'OL';
      const check = el.classList.contains('checklist');
      const indent = '  '.repeat(listDepth);
      const items = [...el.children].map((li, i) => {
        const mark = ordered ? `${i + 1}.` : check ? `- [${li.getAttribute('data-checked') === 'true' ? 'x' : ' '}]` : '-';
        const text = [...li.childNodes].map((c) => walk(c, listDepth + 1)).join('').trim();
        return `${indent}${mark} ${text}`;
      });
      return `\n${items.join('\n')}\n`;
    }
    case 'DIV':
    case 'P':
      return `${inner()}\n`;
    default:
      return inner();
  }
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${sanitizeHtml(html)}`, 'text/html');
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadFile(filename: string, content: string, mime: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: mime }));
  link.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

export function noteDocument(note: Note): string {
  const title = escapeHtml(noteTitle(note));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1c1a; max-width: 720px; margin: 32px auto; padding: 0 24px; }
h1.title { font-size: 24px; margin: 0 0 4px; } p.meta { color: #666; font-size: 12px; margin: 0 0 20px; }
${CONTENT_CSS}</style></head><body><h1 class="title">${title}</h1>
<p class="meta">Last edited ${escapeHtml(new Date(note.updatedAt).toLocaleString())}</p>
<div class="jh-content">${sanitizeHtml(note.html)}</div></body></html>`;
}

export function exportNote(note: Note, format: 'md' | 'html' | 'txt') {
  const name = noteTitle(note);
  if (format === 'md') downloadFile(`${name}.md`, `# ${name}\n\n${htmlToMarkdown(note.html)}`, 'text/markdown');
  else if (format === 'html') downloadFile(`${name}.html`, noteDocument(note), 'text/html');
  else downloadFile(`${name}.txt`, `${name}\n\n${note.text}\n`, 'text/plain');
}

/** Prints through a hidden frame so it works from the popup and side panel too. */
export function printNote(note: Note) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = noteDocument(note);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.append(frame);
}
