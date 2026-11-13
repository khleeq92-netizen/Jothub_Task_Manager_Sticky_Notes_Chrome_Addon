import { addDays, today } from '../core/dates';
import { getRecords, getStickyIds, save, watchRecords } from '../core/db';
import { escapeHtml, hostOf, normalizeUrl, noteMatchesUrl, noteTitle } from '../core/notes';
import { bindEditor, CONTENT_CSS, editorText, runCommand, type RichCommand } from '../core/richtext';
import { sanitizeHtml } from '../core/sanitize';
import { loadSettings } from '../core/settings';
import { FONTS, newNote, newTask, NOTE_COLORS, NOTE_HEX, PRIORITIES, type Note, type NoteScope, type Priority } from '../core/types';
import { platform } from '../platform';

// Floating sticky notes on web pages. Plain DOM inside a shadow root: no
// framework is injected into pages, and a page with no notes costs one small
// storage read.

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; font: 14px/1.45 ${FONTS.sans.css}; color: #23211c; }
.note { position: absolute; display: flex; flex-direction: column; pointer-events: auto; min-width: 180px; min-height: 34px;
  border-radius: 6px 6px 16px 6px; box-shadow: 0 2px 4px rgba(0,0,0,.18), 0 10px 28px rgba(0,0,0,.22);
  animation: pop .16s ease-out; }
@keyframes pop { from { transform: scale(.94); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .note { animation: none; } }
.head { display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 0; cursor: grab; background: rgba(0,0,0,.07); border-radius: 6px 6px 0 0; touch-action: none; user-select: none; }
.head:active { cursor: grabbing; }
.grip { width: 18px; align-self: stretch; opacity: .45; background: radial-gradient(currentColor 1.2px, transparent 1.4px) 4px 5px / 6px 6px; }
.title { flex: 1; min-width: 0; border: 0; background: transparent; font: 600 13px/1.3 inherit; font-family: inherit; color: inherit; padding: 3px 4px; border-radius: 4px; outline: none; }
.title:focus { background: rgba(255,255,255,.55); }
.title::placeholder { color: rgba(35,33,28,.5); font-weight: 500; }
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; border-radius: 5px; padding: 0; }
.ib { width: 24px; height: 24px; display: grid; place-items: center; font-size: 14px; line-height: 1; opacity: .7; }
.ib:hover, .ib:focus-visible { background: rgba(0,0,0,.12); opacity: 1; outline: none; }
.tools { display: flex; gap: 1px; padding: 2px 6px; border-bottom: 1px solid rgba(0,0,0,.08); }
.tools .ib { width: 26px; height: 22px; font-size: 12.5px; }
.body { flex: 1; overflow: auto; padding: 8px 10px 14px; min-height: 40px; }
.body:empty::before { content: 'Write a note…'; color: rgba(35,33,28,.45); }
.resize { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; touch-action: none; border-radius: 0 0 16px 0;
  background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,.28) 50%, rgba(0,0,0,.28) 58%, transparent 58%, transparent 70%, rgba(0,0,0,.28) 70%, rgba(0,0,0,.28) 78%, transparent 78%); }
.note.min .tools, .note.min .body, .note.min .resize, .note.min .menu { display: none; }
.note.min { height: auto !important; border-radius: 6px; }
.note.min .head { border-radius: 6px; }
.menu { position: absolute; top: 34px; right: 6px; width: 190px; padding: 6px; border-radius: 10px; background: #fff; color: #23211c;
  box-shadow: 0 8px 28px rgba(0,0,0,.28); z-index: 2; display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 16px); overflow-y: auto; }
.menu[hidden] { display: none; }
.menu .label { font-size: 11px; font-weight: 600; opacity: .6; padding: 4px 6px 2px; text-transform: uppercase; letter-spacing: .04em; }
.menu .item { text-align: left; padding: 6px 8px; font-size: 13px; }
.menu .item:hover, .menu .item:focus-visible { background: #f0efea; outline: none; }
.menu .item[aria-checked="true"]::after { content: '✓'; float: right; }
.menu .danger { color: #b3261e; }
.dots { display: flex; gap: 5px; padding: 4px 6px 6px; }
.dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,.25); }
.dot[aria-pressed="true"] { box-shadow: 0 0 0 2px #23211c; }
.card { position: absolute; z-index: 2000000000; top: 16px; right: 16px; width: 300px; padding: 14px; border-radius: 12px; background: #fff; color: #23211c;
  pointer-events: auto; box-shadow: 0 10px 34px rgba(0,0,0,.3); display: flex; flex-direction: column; gap: 8px; animation: pop .16s ease-out; }
.card h3 { margin: 0; font-size: 14px; }
.card input, .card select { font: inherit; padding: 7px 9px; border: 1px solid #cfccc3; border-radius: 8px; background: #fff; color: inherit; width: 100%; }
.card input:focus, .card select:focus { outline: 2px solid #4f46e5; outline-offset: 1px; }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.btn { padding: 7px 12px; border-radius: 8px; font-weight: 600; font-size: 13px; background: #efeee9; }
.btn.primary { background: #4f46e5; color: #fff; }
.toast { position: absolute; z-index: 2000000001; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; background: #23211c; color: #fff;
  font-size: 13px; pointer-events: auto; box-shadow: 0 6px 20px rgba(0,0,0,.3); display: flex; align-items: center; gap: 14px; white-space: nowrap; }
.toast button { color: #ffe27a; font-weight: 700; }
${CONTENT_CSS}`;

const TOOLS: { cmd: RichCommand; label: string; title: string; style?: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: 'font-weight:700' },
  { cmd: 'italic', label: 'I', title: 'Italic', style: 'font-style:italic' },
  { cmd: 'underline', label: 'U', title: 'Underline', style: 'text-decoration:underline' },
  { cmd: 'h2', label: 'H', title: 'Heading', style: 'font-weight:700' },
  { cmd: 'ul', label: '•', title: 'Bullet list' },
  { cmd: 'ol', label: '1.', title: 'Numbered list' },
  { cmd: 'check', label: '☑', title: 'Checklist' },
];

interface View {
  note: Note;
  el: HTMLElement;
  sync(note: Note): void;
  relayout(): void;
  focus(): void;
}

let layer: HTMLElement | null = null;
const views = new Map<string, View>();
let lastHref = location.href;
let hidden = false;
let zTop = 1;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const host = document.createElement('jot-hub-notes');
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', { text: CSS }));
  layer = h('div', { class: 'layer' });
  root.append(layer);
  // Typing in a note must not trigger the page's own keyboard shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation());
  document.documentElement.append(host);
  return layer;
}

function toast(message: string, undo?: () => void) {
  const target = ensureLayer();
  target.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { text: message }));
  if (undo) {
    const button = h('button', { type: 'button', text: 'Undo' });
    button.addEventListener('click', () => {
      el.remove();
      undo();
    });
    el.append(button);
  }
  target.append(el);
  setTimeout(() => el.remove(), undo ? 7000 : 2600);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

async function persist(note: Note): Promise<Note> {
  try {
    const [saved] = await save(note);
    return saved;
  } catch {
    toast('Jot Hub was updated. Reload this page to keep editing notes.');
    return note;
  }
}

function createView(initial: Note, index: number): View {
  let note = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let z = ++zTop;
  let pos = note.pos ?? { x: window.innerWidth - 290 - (index % 6) * 24, y: 84 + (index % 6) * 24, w: 260, h: 240 };

  const title = h('input', { class: 'title', placeholder: 'Sticky note', 'aria-label': 'Note title', maxlength: '120' });
  const minBtn = h('button', { class: 'ib', title: 'Minimize', 'aria-label': 'Minimize', text: '–' });
  const menuBtn = h('button', { class: 'ib', title: 'More', 'aria-label': 'More options', text: '⋯' });
  const closeBtn = h('button', { class: 'ib', title: 'Remove from this page (the note stays in Jot Hub)', 'aria-label': 'Remove from this page', text: '✕' });
  const head = h('div', { class: 'head' }, h('div', { class: 'grip' }), title, minBtn, menuBtn, closeBtn);
  const tools = h('div', { class: 'tools' });
  const body = h('div', { class: 'body jh-content', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note text' });
  const menu = h('div', { class: 'menu', hidden: '' });
  const resize = h('div', { class: 'resize', title: 'Resize' });
  const el = h('div', { class: 'note' }, head, tools, body, menu, resize);

  const place = () => {
    pos.w = clamp(pos.w, 180, window.innerWidth - 8);
    pos.h = clamp(pos.h, 120, window.innerHeight - 8);
    pos.x = clamp(pos.x, 0, window.innerWidth - 80);
    pos.y = clamp(pos.y, 0, window.innerHeight - 34);
    el.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${z};background:${NOTE_HEX[note.color]};${note.font ? `font-family:${FONTS[note.font].css};` : ''}`;
    el.classList.toggle('min', note.minimized);
    minBtn.textContent = note.minimized ? '▢' : '–';
    minBtn.title = note.minimized ? 'Expand' : 'Minimize';
    title.placeholder = note.minimized ? noteTitle({ title: '', text: note.text }) : 'Sticky note';
  };

  const commit = (patch: Partial<Note>, delay = 350) => {
    note = { ...note, ...patch };
    clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = undefined;
      const saved = await persist(note);
      if (saved.id === note.id && !timer) note = { ...note, updatedAt: saved.updatedAt };
    }, delay);
  };

  for (const tool of TOOLS) {
    const button = h('button', { class: 'ib', title: tool.title, 'aria-label': tool.title, text: tool.label, style: tool.style ?? '' });
    button.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selection
    button.addEventListener('click', () => runCommand(body, tool.cmd));
    tools.append(button);
  }

  body.innerHTML = sanitizeHtml(note.html);
  title.value = note.title;
  bindEditor(body, () => commit({ html: sanitizeHtml(body.innerHTML), text: editorText(body) }));
  title.addEventListener('input', () => commit({ title: title.value }));
  minBtn.addEventListener('click', () => {
    commit({ minimized: !note.minimized }, 0);
    place();
  });

  // Takes the note off web pages, or bins it. Either way it can be undone.
  const dismiss = (change: Partial<Note>, message: string) => {
    const before = { scope: note.scope, deletedAt: note.deletedAt };
    commit(change, 0);
    toast(message, () => void persist({ ...note, ...before }));
  };
  closeBtn.addEventListener('click', () => dismiss({ scope: 'none' }, 'Removed from the page. The note is still in Jot Hub.'));

  // --- menu ---
  const buildMenu = () => {
    menu.replaceChildren();
    menu.append(h('div', { class: 'label', text: 'Show on' }));
    const scopes: [NoteScope, string][] = [['page', 'This page only'], ['site', `All of ${hostOf(location.href) || 'this site'}`], ['all', 'Every website']];
    for (const [scope, label] of scopes) {
      const item = h('button', { class: 'item', role: 'menuitemradio', 'aria-checked': String(note.scope === scope), text: label });
      item.addEventListener('click', () => {
        commit({ scope, url: normalizeUrl(location.href), host: hostOf(location.href) }, 0);
        menu.hidden = true;
      });
      menu.append(item);
    }
    menu.append(h('div', { class: 'label', text: 'Color' }));
    const dots = h('div', { class: 'dots' });
    for (const color of NOTE_COLORS) {
      const dot = h('button', { class: 'dot', title: color, 'aria-label': color, 'aria-pressed': String(note.color === color), style: `background:${NOTE_HEX[color]}` });
      dot.addEventListener('click', () => {
        commit({ color }, 0);
        place();
        buildMenu();
      });
      dots.append(dot);
    }
    menu.append(dots);
    const action = (label: string, run: () => void, danger = false) => {
      const item = h('button', { class: `item${danger ? ' danger' : ''}`, role: 'menuitem', text: label });
      item.addEventListener('click', () => {
        menu.hidden = true;
        run();
      });
      menu.append(item);
    };
    action('Open in Jot Hub', () => void platform.runtime.send({ type: 'open-app', hash: `#/notes/${note.id}` }).catch(() => {}));
    action('Remove from page (keep note)', () => dismiss({ scope: 'none' }, 'Removed from the page. The note is still in Jot Hub.'));
    action('Delete note', () => dismiss({ deletedAt: Date.now() }, 'Note moved to trash.'), true);
  };
  menuBtn.addEventListener('click', () => {
    if (note.minimized) {
      commit({ minimized: false }, 0);
      place();
    }
    buildMenu();
    menu.hidden = !menu.hidden;
    // Keep the whole menu on screen when the note sits near the bottom of the window.
    menu.style.top = '34px';
    const overflow = menu.getBoundingClientRect().bottom - window.innerHeight + 8;
    if (!menu.hidden && overflow > 0) menu.style.top = `${34 - overflow}px`;
  });
  el.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== menuBtn) menu.hidden = true;
    // Bring to front. (Re-inserting the element instead would cancel a drag in progress.)
    if (z !== zTop) {
      z = ++zTop;
      el.style.zIndex = String(z);
    }
  });

  // --- drag and resize ---
  const track = (handle: HTMLElement, apply: (dx: number, dy: number, start: typeof pos) => void) => {
    handle.addEventListener('pointerdown', (down) => {
      if (down.button !== 0 || (down.target as HTMLElement).closest('button, input')) return;
      down.preventDefault();
      const start = { ...pos };
      handle.setPointerCapture(down.pointerId);
      const move = (e: PointerEvent) => {
        apply(e.clientX - down.clientX, e.clientY - down.clientY, start);
        place();
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        commit({ pos: { ...pos } }, 0);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  };
  track(head, (dx, dy, start) => {
    pos.x = start.x + dx;
    pos.y = start.y + dy;
  });
  track(resize, (dx, dy, start) => {
    pos.w = start.w + dx;
    pos.h = start.h + dy;
  });

  place();
  return {
    get note() {
      return note;
    },
    el,
    focus: () => body.focus(),
    relayout: place,
    sync(next) {
      if (timer || next.updatedAt <= note.updatedAt) return; // our own edit, or older than what we have
      const editing = el.matches(':focus-within');
      note = next;
      if (next.pos) pos = { ...next.pos };
      if (!editing) {
        body.innerHTML = sanitizeHtml(next.html);
        title.value = next.title;
      }
      place();
    },
  };
}

async function refresh() {
  let notes: Note[] = [];
  try {
    const ids = await getStickyIds();
    if (ids.length) notes = (await getRecords(ids)).filter((r): r is Note => r.type === 'note' && noteMatchesUrl(r, location.href));
  } catch {
    return; // extension reloaded; this page's script is orphaned
  }
  const keep = new Set(notes.map((n) => n.id));
  for (const [id, view] of views) {
    if (!keep.has(id)) {
      view.el.remove();
      views.delete(id);
    }
  }
  if (!notes.length) return;
  const target = ensureLayer();
  for (const note of notes) {
    const existing = views.get(note.id);
    if (existing) existing.sync(note);
    else {
      const view = createView(note, views.size);
      views.set(note.id, view);
      if (!hidden) target.append(view.el);
    }
  }
}

async function createNote(text: string) {
  const settings = await loadSettings();
  const clean = text.trim();
  const note = newNote({
    color: settings.noteColor,
    font: settings.font === 'sans' ? '' : settings.font,
    scope: 'page',
    url: normalizeUrl(location.href),
    host: hostOf(location.href),
    html: clean ? `<blockquote>${escapeHtml(clean).replace(/\n/g, '<br>')}</blockquote><div><br></div>` : '',
    text: clean,
  });
  const saved = await persist(note);
  hidden = false;
  const view = createView(saved, views.size);
  views.set(saved.id, view);
  const target = ensureLayer();
  for (const v of views.values()) target.append(v.el);
  view.focus();
}

function quickTask(text: string) {
  const target = ensureLayer();
  target.querySelector('.card')?.remove();
  const title = h('input', { placeholder: 'What needs doing?', 'aria-label': 'Task title', maxlength: '200' });
  title.value = text.trim().replace(/\s+/g, ' ').slice(0, 200);
  const due = h('input', { type: 'date', 'aria-label': 'Due date' });
  const priority = h('select', { 'aria-label': 'Priority' });
  for (const p of PRIORITIES) priority.append(h('option', { value: p, text: p[0].toUpperCase() + p.slice(1) + ' priority' }));
  priority.value = 'medium';
  const todayBtn = h('button', { class: 'btn', type: 'button', text: 'Today' });
  const tomorrowBtn = h('button', { class: 'btn', type: 'button', text: 'Tomorrow' });
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancel' });
  const add = h('button', { class: 'btn primary', type: 'submit', text: 'Add task' });
  const form = h('form', { class: 'card' }, h('h3', { text: 'Quick task' }), title, h('div', { class: 'row' }, due, priority), h('div', { class: 'row' }, todayBtn, tomorrowBtn), h('div', { class: 'row' }, cancel, add));
  todayBtn.addEventListener('click', () => (due.value = today()));
  tomorrowBtn.addEventListener('click', () => (due.value = addDays(today(), 1)));
  cancel.addEventListener('click', () => form.remove());
  form.addEventListener('keydown', (e) => e.key === 'Escape' && form.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!title.value.trim()) return title.focus();
    const settings = await loadSettings();
    try {
      await save(newTask({ title: title.value.trim(), due: due.value, priority: priority.value as Priority, sourceUrl: location.href, description: document.title, reminder: due.value ? settings.defaultReminder : null }));
      form.remove();
      toast('Task added to Jot Hub');
    } catch {
      toast('Jot Hub was updated. Reload this page and try again.');
    }
  });
  target.append(form);
  title.focus();
}

platform.runtime.onMessage((message) => {
  switch (message?.type) {
    case 'jh-new-note':
      return createNote(typeof message.text === 'string' ? message.text : '').then(() => true);
    case 'jh-quick-task':
      quickTask(typeof message.text === 'string' && message.text ? message.text : String(getSelection() ?? ''));
      return Promise.resolve(true);
    case 'jh-toggle':
      hidden = !hidden;
      for (const view of views.values()) hidden ? view.el.remove() : ensureLayer().append(view.el);
      return Promise.resolve({ hidden, count: views.size });
    case 'jh-ping':
      return Promise.resolve({ count: views.size, hidden });
  }
  return undefined;
});

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
watchRecords((changed) => {
  if (!changed.some((r) => r.type === 'note')) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 120);
});

// Single-page apps change the URL without loading a new page.
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  void refresh();
}, 1500);

window.addEventListener('resize', () => {
  for (const view of views.values()) view.relayout(); // keep notes inside a smaller window
});

void refresh();
