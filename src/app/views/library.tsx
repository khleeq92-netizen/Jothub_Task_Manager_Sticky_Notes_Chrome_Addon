import { Copy, FileText, Folder as FolderIcon, FolderPlus, Globe, LayoutTemplate, Pencil, Plus, RotateCcw, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { timeAgo } from '../../core/dates';
import { noteTitle } from '../../core/notes';
import { BUILTIN_TEMPLATES } from '../../core/templates';
import { newFolder, newTemplate, NOTE_COLORS, NOTE_HEX, type AnyRecord, type Folder, type NoteColor, type Template } from '../../core/types';
import { applyTemplate, createNote } from '../actions';
import { NoteCard, NoteEditor, RichEditor, TaskRow } from '../components';
import { moveToTrash, patch, purge, restoreFromTrash, saveRecord, saveRecords, useData, useNow } from '../store';
import { ColorDots, confirmDialog, Empty, Field, go, IconButton, Modal, PageHead, toast } from '../ui';

// The Folders view hands its selection to My Notes through this.
let presetFolder = '';
export const openFolder = (id: string) => {
  presetFolder = id;
  go('notes');
};

// ---- My Notes ---------------------------------------------------------------

export function NotesView({ id }: { id: string }) {
  const { notes, folders } = useData();
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState(() => {
    const preset = presetFolder;
    presetFolder = '';
    return preset;
  });
  const [color, setColor] = useState('');
  const [attached, setAttached] = useState(false);
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = notes.filter(
      (n) =>
        (!folder || (folder === 'none' ? !n.folderId : n.folderId === folder)) &&
        (!color || n.color === color) &&
        (!attached || n.scope !== 'none') &&
        (!q || n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q)),
    );
    if (sort === 'created') filtered.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    if (sort === 'title') filtered.sort((a, b) => Number(b.pinned) - Number(a.pinned) || noteTitle(a).localeCompare(noteTitle(b)));
    return filtered;
  }, [notes, query, folder, color, attached, sort]);

  const filtering = !!(query || folder || color || attached);

  return (
    <div className={`split ${id ? 'has-detail' : ''}`}>
      <div className="split-list">
        <PageHead title="My Notes" subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'}`}>
          <button className="btn primary" onClick={() => createNote(folder && folder !== 'none' ? { folderId: folder } : {})}><Plus size={16} /> New note</button>
        </PageHead>
        <div className="filters">
          <label className="search-box">
            <Search size={15} />
            <input type="search" placeholder="Filter notes" aria-label="Filter notes" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">All folders</option>
            <option value="none">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">Any color</option>
            {NOTE_COLORS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated">Recently edited</option>
            <option value="created">Recently created</option>
            <option value="title">Title A–Z</option>
          </select>
          <IconButton label="Only notes that float on web pages" active={attached} onClick={() => setAttached(!attached)}><Globe size={16} /></IconButton>
        </div>
        {list.length ? (
          <div className="note-grid">
            {list.map((n) => <NoteCard key={n.id} note={n} active={n.id === id} onOpen={() => go('notes', n.id)} />)}
          </div>
        ) : filtering ? (
          <Empty icon={<Search size={26} />} title="No notes match" hint="Try a different search or clear the filters." />
        ) : (
          <Empty icon={<FileText size={26} />} title="No notes yet" hint="Write your first note, or start from a template.">
            <div className="row">
              <button className="btn primary" onClick={() => createNote()}>New note</button>
              <button className="btn" onClick={() => go('templates')}>Browse templates</button>
            </div>
          </Empty>
        )}
      </div>
      <div className="split-detail">
        {id ? <NoteEditor key={id} id={id} onBack={() => go('notes')} /> : <div className="editor-empty muted">Select a note to read or edit it.</div>}
      </div>
    </div>
  );
}

// ---- Folders -------------------------------------------------------------------

export function FoldersView() {
  const { folders, notes } = useData();
  const [editing, setEditing] = useState<Folder | null>(null);

  const remove = async (folder: Folder) => {
    const inside = notes.filter((n) => n.folderId === folder.id);
    const ok = await confirmDialog({
      title: `Delete “${folder.name}”?`,
      message: inside.length ? `Its ${inside.length} note${inside.length === 1 ? '' : 's'} will be kept and moved out of the folder.` : 'The folder is empty.',
      confirmLabel: 'Delete folder',
      danger: true,
    });
    if (!ok) return;
    saveRecords(...inside.map((n) => ({ ...n, folderId: null })));
    moveToTrash(folder.id);
  };

  return (
    <div className="page">
      <PageHead title="Folders" subtitle="Group notes by project or topic.">
        <button className="btn primary" onClick={() => setEditing(newFolder({ name: '' }))}><FolderPlus size={16} /> New folder</button>
      </PageHead>
      {folders.length ? (
        <div className="card-grid">
          {folders.map((f) => {
            const count = notes.filter((n) => n.folderId === f.id).length;
            return (
              <div key={f.id} className="folder-card">
                <button className="folder-open" onClick={() => openFolder(f.id)}>
                  <span className="folder-icon" style={{ background: NOTE_HEX[f.color] }}><FolderIcon size={20} /></span>
                  <span>
                    <strong>{f.name}</strong>
                    <span className="muted small">{count} note{count === 1 ? '' : 's'}</span>
                  </span>
                </button>
                <IconButton label={`Rename ${f.name}`} className="quiet" onClick={() => setEditing(f)}><Pencil size={15} /></IconButton>
                <IconButton label={`Delete ${f.name}`} className="quiet" onClick={() => remove(f)}><Trash2 size={15} /></IconButton>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<FolderIcon size={26} />} title="No folders yet" hint="Create a folder, then choose it from any note.">
          <button className="btn primary" onClick={() => setEditing(newFolder({ name: '' }))}>New folder</button>
        </Empty>
      )}
      {editing && <FolderDialog folder={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FolderDialog({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<NoteColor>(folder.color);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveRecord({ ...folder, name: name.trim(), color });
    onClose();
  };
  return (
    <Modal title={folder.name ? 'Rename folder' : 'New folder'} onClose={onClose} width={380}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input autoFocus value={name} maxLength={60} placeholder="Work, Recipes, Ideas…" onChange={(e) => setName(e.target.value)} /></Field>
        <div className="field"><span className="field-label">Color</span><ColorDots value={color} onChange={setColor} /></div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Favorites --------------------------------------------------------------------

export function FavoritesView() {
  const { notes, tasks } = useData();
  const favNotes = notes.filter((n) => n.favorite);
  const favTasks = tasks.filter((t) => t.favorite);
  return (
    <div className="page">
      <PageHead title="Favorites" subtitle="Notes and tasks you starred." />
      {!favNotes.length && !favTasks.length && <Empty icon={<Star size={26} />} title="Nothing starred yet" hint="Use the star on a note or task to keep it here." />}
      {favNotes.length > 0 && (
        <section className="section">
          <h2>Notes</h2>
          <div className="note-grid wide">{favNotes.map((n) => <NoteCard key={n.id} note={n} onOpen={() => go('notes', n.id)} />)}</div>
        </section>
      )}
      {favTasks.length > 0 && (
        <section className="section">
          <h2>Tasks</h2>
          <div className="panel list">{favTasks.map((t) => <TaskRow key={t.id} task={t} />)}</div>
        </section>
      )}
    </div>
  );
}

// ---- Trash -----------------------------------------------------------------------

const describe = (r: AnyRecord): { kind: string; name: string } => {
  switch (r.type) {
    case 'note':
      return { kind: 'Note', name: noteTitle(r) };
    case 'task':
      return { kind: 'Task', name: r.title || 'Untitled task' };
    case 'folder':
      return { kind: 'Folder', name: r.name };
    case 'template':
      return { kind: 'Template', name: r.name };
    default:
      return { kind: 'Item', name: r.id };
  }
};

export function TrashView() {
  const { trash } = useData();
  const now = useNow();

  const empty = async () => {
    const ok = await confirmDialog({
      title: 'Empty the trash?',
      message: `${trash.length} item${trash.length === 1 ? '' : 's'} will be permanently deleted from this device and from the cloud. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    });
    if (ok) purge(...trash.map((r) => r.id));
  };
  const removeOne = async (r: AnyRecord) => {
    const ok = await confirmDialog({ title: `Delete “${describe(r).name}” forever?`, message: 'This cannot be undone.', confirmLabel: 'Delete forever', danger: true });
    if (ok) purge(r.id);
  };

  return (
    <div className="page">
      <PageHead title="Trash" subtitle="Deleted items stay here for 30 days.">
        {trash.length > 0 && <button className="btn danger-quiet" onClick={empty}><Trash2 size={15} /> Empty trash</button>}
      </PageHead>
      {trash.length ? (
        <div className="panel list">
          {trash.map((r) => {
            const d = describe(r);
            return (
              <div key={r.id} className="trash-row">
                <span className="badge">{d.kind}</span>
                <span className="grow ellipsis">{d.name}</span>
                <span className="muted small">deleted {timeAgo(r.deletedAt ?? now, now)}</span>
                <button className="btn small" onClick={() => { restoreFromTrash(r.id); toast(`${d.kind} restored`); }}><RotateCcw size={14} /> Restore</button>
                <IconButton label="Delete forever" className="quiet" onClick={() => removeOne(r)}><Trash2 size={15} /></IconButton>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Trash2 size={26} />} title="Trash is empty" />
      )}
    </div>
  );
}

// ---- Templates ----------------------------------------------------------------------

export function TemplatesView() {
  const { templates } = useData();
  const [editing, setEditing] = useState<string | null>(null);

  const duplicate = (t: Template) => {
    const copy = saveRecord(newTemplate({ name: `${t.name} (copy)`, description: t.description, icon: t.icon, color: t.color, html: t.html }));
    setEditing(copy.id);
  };
  const create = () => setEditing(saveRecord(newTemplate({ name: 'My template', html: '<h1>Title</h1><div><br></div>' })).id);

  const card = (t: Template) => (
    <div key={t.id} className="template-card">
      <div className="template-top" style={{ background: NOTE_HEX[t.color] }}>
        <span className="template-icon" aria-hidden="true">{t.icon}</span>
      </div>
      <div className="template-body">
        <strong>{t.name}</strong>
        <p className="muted small">{t.description || 'Custom template'}</p>
        <div className="row">
          <button className="btn primary small" onClick={() => applyTemplate(t)}>Use</button>
          <IconButton label={`Duplicate ${t.name}`} className="quiet" onClick={() => duplicate(t)}><Copy size={15} /></IconButton>
          {!t.builtin && <IconButton label={`Edit ${t.name}`} className="quiet" onClick={() => setEditing(t.id)}><Pencil size={15} /></IconButton>}
          {!t.builtin && (
            <IconButton label={`Delete ${t.name}`} className="quiet" onClick={() => { moveToTrash(t.id); toast('Template moved to trash', { label: 'Undo', run: () => restoreFromTrash(t.id) }); }}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHead title="Templates" subtitle="Start a note from a ready-made layout, or build your own.">
        <button className="btn primary" onClick={create}><Plus size={16} /> New template</button>
      </PageHead>
      <section className="section">
        <h2>My templates</h2>
        {templates.length ? (
          <div className="card-grid templates">{templates.map(card)}</div>
        ) : (
          <p className="muted">None yet. Create one, duplicate a ready-made template, or use “Save as template” in any note.</p>
        )}
      </section>
      <section className="section">
        <h2>Ready-made</h2>
        <div className="card-grid templates">{BUILTIN_TEMPLATES.map(card)}</div>
      </section>
      {editing && <TemplateDialog id={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { byId } = useData();
  const t = byId.get(id);
  if (!t || t.type !== 'template' || t.purged) return null;
  const set = (change: Partial<Template>) => patch<Template>(id, change);
  return (
    <Modal title="Edit template" onClose={onClose} width={640}>
      <div className="form">
        <div className="grid-icon">
          <Field label="Icon"><input value={t.icon} maxLength={4} aria-label="Icon (emoji)" onChange={(e) => set({ icon: e.target.value })} /></Field>
          <Field label="Name"><input value={t.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Field>
        </div>
        <Field label="Description"><input value={t.description} maxLength={160} placeholder="What is this template for?" onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="field"><span className="field-label">Note color</span><ColorDots value={t.color} onChange={(color) => set({ color })} /></div>
        <div className="field">
          <span className="field-label">Content</span>
          <div className="template-editor" style={{ ['--paper' as any]: NOTE_HEX[t.color] }}>
            <RichEditor key={id} html={t.html} onChange={(html) => set({ html })} placeholder="Headings, lists and checklists that every new note should start with…" />
          </div>
          <span className="field-hint">Tip: {'{{date}}'}, {'{{weekday}}'}, {'{{week}}'} and {'{{month}}'} are filled in when the template is used.</span>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => { applyTemplate(t); onClose(); }}><LayoutTemplate size={15} /> Use now</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
