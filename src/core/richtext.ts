import { sanitizeHtml } from './sanitize';
import { FONTS, type FontKey } from './types';

// Framework-free rich-text helpers shared by the React editor and the
// floating notes in the content script. Works inside a shadow root.

export type RichCommand = 'bold' | 'italic' | 'underline' | 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'check' | 'clear' | 'font' | 'size';

export const FONT_SIZES = [
  { value: '2', label: 'Small' },
  { value: '3', label: 'Normal' },
  { value: '5', label: 'Large' },
  { value: '6', label: 'Huge' },
];

function selectionNode(editor: HTMLElement): Node | null {
  const root = editor.getRootNode() as any;
  const selection: Selection | null = typeof root.getSelection === 'function' ? root.getSelection() : document.getSelection();
  return selection?.anchorNode ?? null;
}

function closest(editor: HTMLElement, tags: string[]): HTMLElement | null {
  let node = selectionNode(editor);
  while (node && node !== editor) {
    if (node.nodeType === 1 && tags.includes((node as HTMLElement).tagName)) return node as HTMLElement;
    node = node.parentNode;
  }
  return null;
}

const exec = (command: string, value?: string) => document.execCommand(command, false, value);

export function runCommand(editor: HTMLElement, command: RichCommand, value?: string) {
  editor.focus();
  exec('styleWithCSS', 'false');
  switch (command) {
    case 'bold':
    case 'italic':
    case 'underline':
      exec(command);
      break;
    case 'h1':
    case 'h2':
      exec('formatBlock', closest(editor, [command.toUpperCase()]) ? 'DIV' : command.toUpperCase());
      break;
    case 'p':
      exec('formatBlock', 'DIV');
      break;
    case 'ol':
      exec('insertOrderedList');
      break;
    case 'ul': {
      const list = closest(editor, ['UL']);
      if (list?.classList.contains('checklist')) list.removeAttribute('class');
      else exec('insertUnorderedList');
      break;
    }
    case 'check': {
      const list = closest(editor, ['UL']);
      if (list?.classList.contains('checklist')) exec('insertUnorderedList'); // toggles the list off
      else {
        if (!list) exec('insertUnorderedList');
        closest(editor, ['UL'])?.classList.add('checklist');
      }
      break;
    }
    case 'font':
      exec('fontName', FONTS[value as FontKey]?.css ?? FONTS.sans.css);
      break;
    case 'size':
      exec('fontSize', value ?? '3');
      break;
    case 'clear':
      exec('removeFormat');
      break;
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Wires checklist ticking, safe paste and change notification onto an editable element. */
export function bindEditor(editor: HTMLElement, onChange: () => void): () => void {
  const onClick = (event: MouseEvent) => {
    const li = (event.target as HTMLElement).closest?.('li');
    if (!li || !li.parentElement?.classList.contains('checklist')) return;
    if (event.clientX - li.getBoundingClientRect().left > 24) return; // only the box toggles
    event.preventDefault();
    if (li.getAttribute('data-checked') === 'true') li.removeAttribute('data-checked');
    else li.setAttribute('data-checked', 'true');
    onChange();
  };
  const onInput = (event: Event) => {
    // A new checklist line starts unticked, even when split from a ticked one.
    if ((event as InputEvent).inputType === 'insertParagraph') closest(editor, ['LI'])?.removeAttribute('data-checked');
    onChange();
  };
  const onPaste = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    if (html) exec('insertHTML', sanitizeHtml(html));
    else exec('insertText', event.clipboardData.getData('text/plain'));
  };
  editor.addEventListener('click', onClick);
  editor.addEventListener('input', onInput);
  editor.addEventListener('paste', onPaste);
  return () => {
    editor.removeEventListener('click', onClick);
    editor.removeEventListener('input', onInput);
    editor.removeEventListener('paste', onPaste);
  };
}

/** Text as the user sees it, one block per line. */
export const editorText = (editor: HTMLElement) => (editor.innerText ?? editor.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();

/** CSS for note content. Shared so notes look the same in the hub and on pages. */
export const CONTENT_CSS = `
.jh-content { outline: none; word-break: break-word; line-height: 1.5; }
.jh-content h1 { font-size: 1.5em; margin: .4em 0 .2em; line-height: 1.25; }
.jh-content h2 { font-size: 1.2em; margin: .4em 0 .2em; line-height: 1.3; }
.jh-content h3 { font-size: 1.05em; margin: .4em 0 .2em; }
.jh-content ul, .jh-content ol { margin: .25em 0; padding-left: 1.5em; }
.jh-content ul.checklist { list-style: none; padding-left: 0; }
.jh-content ul.checklist > li { position: relative; padding-left: 26px; }
.jh-content ul.checklist > li::before {
  content: ''; position: absolute; left: 2px; top: .22em; width: 14px; height: 14px;
  border: 1.5px solid currentColor; border-radius: 4px; opacity: .65; cursor: pointer; box-sizing: border-box;
}
.jh-content ul.checklist > li[data-checked="true"] { opacity: .55; text-decoration: line-through; }
.jh-content ul.checklist > li[data-checked="true"]::before {
  opacity: 1; background: currentColor;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 52%, 38% 82%, 84% 26%, 72% 16%, 38% 60%, 14% 40%, 0 52%);
}
.jh-content blockquote { margin: .4em 0; padding-left: .8em; border-left: 3px solid currentColor; opacity: .85; }
.jh-content a { color: inherit; text-decoration: underline; }
.jh-content hr { border: 0; border-top: 1px solid currentColor; opacity: .3; margin: .6em 0; }
`;
