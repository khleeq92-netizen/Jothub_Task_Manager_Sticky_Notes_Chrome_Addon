import {
  ArrowLeft, Bell, Bold, Check, Copy, Download, FileText, Folder as FolderIcon, Globe, Heading1, Heading2, Italic, LayoutTemplate, Link2, List, ListChecks,
  ListOrdered, Maximize2, Minimize2, MoreHorizontal, Pin, Plus, Printer, RemoveFormatting, Repeat, Star, Trash2, Underline, X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { friendlyDate, friendlyTime, timeAgo } from '../core/dates';
import { exportNote, printNote } from '../core/exporters';
import { hostOf, normalizeUrl, noteTitle, scopeLabel } from '../core/notes';
import { bindEditor, editorText, FONT_SIZES, runCommand, type RichCommand } from '../core/richtext';
import { sanitizeHtml } from '../core/sanitize';
import { displayStatus, PRIORITY_LABEL, RECURRENCE_LABEL, REMINDER_OPTIONS, STATUS_LABEL, subtaskProgress } from '../core/tasks';
import { FONTS, newTemplate, NOTE_HEX, PRIORITIES, RECURRENCES, uid, type FontKey, type Note, type NoteScope, type Task, type TaskStatus } from '../core/types';
import { moveToTrash, patch, restoreFromTrash, saveRecord, toggleTask, useData, useNow } from './store';
import { ColorDots, Field, go, IconButton, Menu, Modal, toast } from './ui';

// ---- rich text editor --------------------------------------------------------

const TOOLS: { cmd: RichCommand; label: string; icon: ReactNode }[] = [
  { cmd: 'bold', label: 'Bold (Ctrl+B)', icon: <Bold size={16} /> },
  { cmd: 'italic', label: 'Italic (Ctrl+I)', icon: <Italic size={16} /> },
  { cmd: 'underline', label: 'Underline (Ctrl+U)', icon: <Underline size={16} /> },
  { cmd: 'h1', label: 'Heading', icon: <Heading1 size={16} /> },
  { cmd: 'h2', label: 'Subheading', icon: <Heading2 size={16} /> },
  { cmd: 'ul', label: 'Bullet list', icon: <List size={16} /> },
  { cmd: 'ol', label: 'Numbered list', icon: <ListOrdered size={16} /> },
  { cmd: 'check', label: 'Checklist', icon: <ListChecks size={16} /> },
  { cmd: 'clear', label: 'Clear formatting', icon: <RemoveFormatting size={16} /> },
];

/**
 * contentEditable editor. Mount it with key={record id}: it loads html once,
 * saves 400 ms after the last keystroke, and flushes when it unmounts.
 */
export function RichEditor({ html, onChange, placeholder = 'Start writing…', font, autoFocus }: { html: string; onChange: (html: string, text: string) => void; placeholder?: string; font?: FontKey | ''; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef(html);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(onChange);
  latest.current = onChange;

  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = sanitizeHtml(html);
    const flush = () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      const clean = sanitizeHtml(el.innerHTML);
      emitted.current = clean;
      latest.current(clean, editorText(el));
    };
    const unbind = bindEditor(el, () => {
      clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 400);
    });
    el.addEventListener('blur', flush);
    if (autoFocus) el.focus();
    return () => {
      unbind();
      el.removeEventListener('blur', flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up edits made elsewhere (a floating note, another device) when not typing here.
  useEffect(() => {
    const el = ref.current!;
    if (html !== emitted.current && timer.current === undefined && document.activeElement !== el) {
      el.innerHTML = sanitizeHtml(html);
      emitted.current = html;
    }
  }, [html]);

  const run = (cmd: RichCommand, value?: string) => ref.current && runCommand(ref.current, cmd, value);

  return (
    <div className="rich">
      <div className="rich-tools" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button key={t.cmd} type="button" className="icon-btn" title={t.label} aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd)}>
            {t.icon}
          </button>
        ))}
        <select aria-label="Font" value="" onChange={(e) => e.target.value && run('font', e.target.value)}>
          <option value="">Font</option>
          {(Object.keys(FONTS) as FontKey[]).map((k) => <option key={k} value={k}>{FONTS[k].label}</option>)}
        </select>
        <select aria-label="Text size" value="" onChange={(e) => e.target.value && run('size', e.target.value)}>
          <option value="">Size</option>
          {FONT_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div ref={ref} className="rich-body jh-content" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Note text" data-placeholder={placeholder} style={font ? { fontFamily: FONTS[font].css } : undefined} />
    </div>
  );
}

// ---- notes -----------------------------------------------------------------------

export function NoteCard({ note, active, onOpen }: { note: Note; active?: boolean; onOpen: () => void }) {
  const now = useNow();
  const { folders } = useData();
  const folder = folders.find((f) => f.id === note.folderId);
  return (
    <button type="button" className={`note-card ${active ? 'active' : ''}`} style={{ background: NOTE_HEX[note.color] }} onClick={onOpen}>
      <span className="note-card-title">
        {note.pinned && <Pin size={13} aria-label="Pinned" />}
        {noteTitle(note)}
      </span>
      <span className="note-card-text">{note.title.trim() ? note.text.slice(0, 160) : note.text.split('\n').slice(1).join(' ').slice(0, 160)}</span>
      <span className="note-card-meta">
        <span>{timeAgo(note.updatedAt, now)}</span>
        {folder && <span><FolderIcon size={11} /> {folder.name}</span>}
        {note.scope !== 'none' && <span><Globe size={11} /> {scopeLabel(note)}</span>}
        {note.favorite && <Star size={11} aria-label="Favorite" />}
      </span>
    </button>
  );
}

export function NoteEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const data = useData();
  const now = useNow();
  const [focus, setFocus] = useState(false);
  const note = data.byId.get(id);

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focus]);

  if (!note || note.type !== 'note' || note.purged) return <div className="editor-empty muted">This note no longer exists.</div>;

  const set = (change: Partial<Note>) => patch<Note>(id, change);
  const linked = data.tasks.filter((t) => t.noteIds.includes(id));
  const words = note.text.trim() ? note.text.trim().split(/\s+/).length : 0;

  const setScope = (scope: NoteScope) => set({ scope });
  const remove = () => {
    moveToTrash(id);
    onBack();
    toast('Note moved to trash', { label: 'Undo', run: () => restoreFromTrash(id) });
  };

  return (
    <section className={`editor ${focus ? 'focus-mode' : ''}`} style={{ ['--paper' as any]: NOTE_HEX[note.color] }} aria-label="Note editor">
      <div className="editor-inner">
        <header className="editor-head">
          {!focus && <IconButton label="Back to list" onClick={onBack} className="only-narrow"><ArrowLeft size={18} /></IconButton>}
          <input className="editor-title" value={note.title} placeholder="Title" aria-label="Note title" onChange={(e) => set({ title: e.target.value })} />
          <IconButton label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => set({ pinned: !note.pinned })}><Pin size={17} /></IconButton>
          <IconButton label={note.favorite ? 'Remove from favorites' : 'Add to favorites'} active={note.favorite} onClick={() => set({ favorite: !note.favorite })}><Star size={17} /></IconButton>
          <IconButton label={focus ? 'Exit focus mode (Esc)' : 'Focus mode'} active={focus} onClick={() => setFocus(!focus)}>{focus ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</IconButton>
          <Menu
            label="More"
            icon={<MoreHorizontal size={18} />}
            items={[
              { label: 'Print', icon: <Printer size={15} />, run: () => printNote(note) },
              { label: 'Export as Markdown', icon: <Download size={15} />, run: () => exportNote(note, 'md') },
              { label: 'Export as HTML', icon: <Download size={15} />, run: () => exportNote(note, 'html') },
              { label: 'Export as text', icon: <Download size={15} />, run: () => exportNote(note, 'txt') },
              null,
              {
                label: 'Duplicate',
                icon: <Copy size={15} />,
                run: () => {
                  const copy = saveRecord({ ...note, id: uid(), title: `${noteTitle(note)} (copy)`, scope: 'none' as const, pinned: false, createdAt: Date.now() });
                  go('notes', copy.id);
                },
              },
              {
                label: 'Save as template',
                icon: <LayoutTemplate size={15} />,
                run: () => {
                  saveRecord(newTemplate({ name: noteTitle(note), description: 'Made from a note', html: note.html, color: note.color }));
                  toast('Saved to Templates');
                },
              },
              null,
              { label: 'Move to trash', icon: <Trash2 size={15} />, run: remove, danger: true },
            ]}
          />
        </header>

        {!focus && (
          <div className="editor-meta">
            <ColorDots value={note.color} onChange={(color) => set({ color })} label="Note color" />
            <select aria-label="Folder" value={note.folderId ?? ''} onChange={(e) => set({ folderId: e.target.value || null })}>
              <option value="">No folder</option>
              {data.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select aria-label="Note font" value={note.font} onChange={(e) => set({ font: e.target.value as FontKey | '' })}>
              <option value="">Default font</option>
              {(Object.keys(FONTS) as FontKey[]).map((k) => <option key={k} value={k}>{FONTS[k].label}</option>)}
            </select>
            <select aria-label="Show on web pages" value={note.scope} onChange={(e) => setScope(e.target.value as NoteScope)}>
              <option value="none">Not on web pages</option>
              <option value="page">Float on one page</option>
              <option value="site">Float on a whole site</option>
              <option value="all">Float on every website</option>
            </select>
            {note.scope === 'page' && (
              <input className="grow" aria-label="Page address" placeholder="https://example.com/page" value={note.url} onChange={(e) => set({ url: e.target.value, host: hostOf(e.target.value) })} onBlur={(e) => e.target.value && set({ url: normalizeUrl(e.target.value) })} />
            )}
            {note.scope === 'site' && (
              <input className="grow" aria-label="Website" placeholder="example.com" value={note.host} onChange={(e) => set({ host: e.target.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') })} />
            )}
          </div>
        )}

        <RichEditor key={id} html={note.html} font={note.font || data.settings.font} onChange={(html, text) => set({ html, text })} autoFocus={!note.html && !!note.title === false} />

        <footer className="editor-foot">
          <span>Saved · edited {timeAgo(note.updatedAt, now)}</span>
          <span>{words} word{words === 1 ? '' : 's'}</span>
          {linked.length > 0 && (
            <span className="linked">
              <Link2 size={13} />
              {linked.map((t) => (
                <button key={t.id} className="chip" onClick={() => go('tasks', t.id)}>{t.title || 'Untitled task'}</button>
              ))}
            </span>
          )}
        </footer>
      </div>
    </section>
  );
}

// ---- tasks -------------------------------------------------------------------------

export function TaskRow({ task, onOpen, showDate = true }: { task: Task; onOpen?: () => void; showDate?: boolean }) {
  const now = useNow();
  const status = displayStatus(task, now);
  const done = status === 'completed';
  return (
    <div className={`task-row ${done ? 'done' : ''} ${status === 'overdue' ? 'overdue' : ''}`}>
      <button type="button" role="checkbox" aria-checked={done} aria-label={done ? 'Mark as not done' : 'Mark as done'} className={`check prio-${task.priority}`} onClick={() => toggleTask(task.id)}>
        {done && <Check size={13} strokeWidth={3} />}
      </button>
      <button type="button" className="task-main" onClick={onOpen ?? (() => go('tasks', task.id))}>
        <span className="task-title">{task.title || 'Untitled task'}</span>
        <span className="task-meta">
          {showDate && task.due && (
            <span className={status === 'overdue' ? 'bad' : ''}>
              {friendlyDate(task.due, now)}
              {task.dueTime ? `, ${friendlyTime(task.dueTime)}` : ''}
            </span>
          )}
          {!showDate && task.dueTime && <span className={status === 'overdue' ? 'bad' : ''}>{friendlyTime(task.dueTime)}</span>}
          {status === 'overdue' && <span className="badge bad">Overdue</span>}
          {status === 'in_progress' && <span className="badge info">In progress</span>}
          {task.priority !== 'medium' && <span className={`badge prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
          {task.recurrence !== 'none' && <span title={RECURRENCE_LABEL[task.recurrence]}><Repeat size={12} /></span>}
          {task.reminder != null && task.due && !done && <span title="Reminder set"><Bell size={12} /></span>}
          {task.subtasks.length > 0 && <span><ListChecks size={12} /> {subtaskProgress(task)}</span>}
          {task.noteIds.length > 0 && <span><FileText size={12} /> {task.noteIds.length}</span>}
          {task.category && <span className="badge">{task.category}</span>}
          {task.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
        </span>
      </button>
      <IconButton label={task.favorite ? 'Remove from favorites' : 'Add to favorites'} active={task.favorite} className="quiet" onClick={() => patch<Task>(task.id, { favorite: !task.favorite })}><Star size={15} /></IconButton>
    </div>
  );
}

export function TaskEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const now = useNow();
  const [subtask, setSubtask] = useState('');
  const [tagText, setTagText] = useState<string | null>(null);
  const task = data.byId.get(id);
  if (!task || task.type !== 'task' || task.purged) return null;

  const set = (change: Partial<Task>) => patch<Task>(id, change);
  const status = displayStatus(task, now);
  const categories = [...new Set(data.tasks.map((t) => t.category).filter(Boolean))].sort();
  const linkable = data.notes.filter((n) => !task.noteIds.includes(n.id));

  const setStatus = (next: TaskStatus) => {
    if ((next === 'completed') !== (task.status === 'completed')) toggleTask(id);
    else set({ status: next });
  };
  const addSubtask = () => {
    if (!subtask.trim()) return;
    set({ subtasks: [...task.subtasks, { id: uid(), title: subtask.trim(), done: false }] });
    setSubtask('');
  };
  const remove = () => {
    moveToTrash(id);
    onClose();
    toast('Task moved to trash', { label: 'Undo', run: () => restoreFromTrash(id) });
  };

  return (
    <Modal title="Task" onClose={onClose} side width={460}>
      <div className="form">
        <input className="task-edit-title" autoFocus={!task.title} value={task.title} placeholder="Task title" aria-label="Task title" onChange={(e) => set({ title: e.target.value })} />
        <div className="status-line">
          <span className={`badge ${status === 'overdue' ? 'bad' : status === 'completed' ? 'ok' : status === 'in_progress' ? 'info' : ''}`}>{STATUS_LABEL[status]}</span>
          {task.sourceUrl && <a className="muted small" href={task.sourceUrl} target="_blank" rel="noopener noreferrer">From {hostOf(task.sourceUrl) || 'a web page'}</a>}
        </div>
        <Field label="Description">
          <textarea rows={3} value={task.description} placeholder="Details, links, context…" onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid-2">
          <Field label="Status">
            <select value={task.status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <Field label="Priority">
            <select value={task.priority} onChange={(e) => set({ priority: e.target.value as Task['priority'] })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" value={task.start} max={task.due || undefined} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field label="Deadline">
            <input type="date" value={task.due} onChange={(e) => set({ due: e.target.value, ...(e.target.value ? (task.reminder == null && !task.due ? { reminder: data.settings.defaultReminder } : {}) : { dueTime: '' }) })} />
          </Field>
          <Field label="Due time">
            <input type="time" value={task.dueTime} disabled={!task.due} onChange={(e) => set({ dueTime: e.target.value })} />
          </Field>
          <Field label="Reminder">
            <select value={task.reminder == null ? '' : String(task.reminder)} disabled={!task.due} onChange={(e) => set({ reminder: e.target.value === '' ? null : Number(e.target.value) })}>
              {REMINDER_OPTIONS.map((o) => <option key={String(o.value)} value={o.value == null ? '' : String(o.value)}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Repeat">
            <select value={task.recurrence} onChange={(e) => set({ recurrence: e.target.value as Task['recurrence'] })}>
              {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <input list="jh-categories" value={task.category} placeholder="Work, Home…" onChange={(e) => set({ category: e.target.value })} />
            <datalist id="jh-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label="Tags" hint="Separate tags with commas.">
          <input
            value={tagText ?? task.tags.join(', ')}
            placeholder="urgent, client, idea"
            onChange={(e) => setTagText(e.target.value)}
            onBlur={() => {
              if (tagText != null) set({ tags: [...new Set(tagText.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))] });
              setTagText(null);
            }}
          />
        </Field>

        <div className="field">
          <span className="field-label">Subtasks {task.subtasks.length > 0 && <span className="muted">({subtaskProgress(task)})</span>}</span>
          {task.subtasks.map((s) => (
            <div key={s.id} className="subtask">
              <input type="checkbox" checked={s.done} aria-label={`Done: ${s.title}`} onChange={() => set({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
              <input className={s.done ? 'struck' : ''} value={s.title} aria-label="Subtask" onChange={(e) => set({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
              <IconButton label="Remove subtask" className="quiet" onClick={() => set({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}><X size={14} /></IconButton>
            </div>
          ))}
          <div className="subtask">
            <Plus size={15} className="muted" />
            <input value={subtask} placeholder="Add a subtask and press Enter" aria-label="New subtask" onChange={(e) => setSubtask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSubtask()} onBlur={addSubtask} />
          </div>
        </div>

        <div className="field">
          <span className="field-label">Linked notes</span>
          <div className="chips">
            {task.noteIds.map((noteId) => {
              const note = data.byId.get(noteId);
              if (!note || note.type !== 'note' || note.purged || note.deletedAt) return null;
              return (
                <span key={noteId} className="chip">
                  <button onClick={() => go('notes', noteId)}>{noteTitle(note)}</button>
                  <button aria-label="Unlink note" onClick={() => set({ noteIds: task.noteIds.filter((n) => n !== noteId) })}><X size={12} /></button>
                </span>
              );
            })}
          </div>
          {linkable.length > 0 && (
            <select aria-label="Link a note" value="" onChange={(e) => e.target.value && set({ noteIds: [...task.noteIds, e.target.value] })}>
              <option value="">Link a note…</option>
              {linkable.map((n) => <option key={n.id} value={n.id}>{noteTitle(n)}</option>)}
            </select>
          )}
        </div>

        <div className="modal-actions spread">
          <button className="btn danger-quiet" onClick={remove}><Trash2 size={15} /> Delete</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
