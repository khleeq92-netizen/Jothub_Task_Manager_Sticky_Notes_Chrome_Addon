export type RecordType = 'note' | 'folder' | 'task' | 'template' | 'settings';

export const NOTE_COLORS = ['yellow', 'pink', 'green', 'blue', 'purple', 'orange', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
/** Paper colors. Text on a note is always dark, in light and dark themes alike. */
export const NOTE_HEX: Record<NoteColor, string> = {
  yellow: '#fff1a3',
  pink: '#ffd0dc',
  green: '#cdebc9',
  blue: '#cde2ff',
  purple: '#e1d5ff',
  orange: '#ffdab5',
  gray: '#e8e8ec',
};

export const FONTS = {
  sans: { label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  serif: { label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  mono: { label: 'Mono', css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  hand: { label: 'Handwriting', css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
} as const;
export type FontKey = keyof typeof FONTS;

export const ACCENTS = {
  indigo: '#4f46e5',
  emerald: '#0f8a65',
  rose: '#d6336c',
  amber: '#b7670a',
  sky: '#0b79b8',
  violet: '#7c3aed',
} as const;
export type Accent = keyof typeof ACCENTS;

export type NoteScope = 'none' | 'page' | 'site' | 'all';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
export const RECURRENCES: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
export const WIDGETS = ['overview', 'today', 'overdue', 'upcoming', 'pinned', 'recent', 'sync'] as const;
export type Widget = (typeof WIDGETS)[number];

export interface BaseRecord {
  id: string;
  type: RecordType;
  createdAt: number;
  updatedAt: number;
  /** Set while the record sits in the trash. */
  deletedAt: number | null;
  /** Permanently deleted: only this stub remains so the deletion can sync. */
  purged?: boolean;
}

export interface Note extends BaseRecord {
  type: 'note';
  title: string;
  html: string;
  /** Plain-text copy of html, kept for search and previews. */
  text: string;
  color: NoteColor;
  folderId: string | null;
  pinned: boolean;
  favorite: boolean;
  /** Where the note floats on web pages. */
  scope: NoteScope;
  url: string;
  host: string;
  pos: { x: number; y: number; w: number; h: number } | null;
  minimized: boolean;
  font: FontKey | '';
}

export interface Folder extends BaseRecord {
  type: 'folder';
  name: string;
  color: NoteColor;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task extends BaseRecord {
  type: 'task';
  title: string;
  description: string;
  start: string; // YYYY-MM-DD or ''
  due: string; // YYYY-MM-DD or ''
  dueTime: string; // HH:MM or ''
  priority: Priority;
  category: string;
  tags: string[];
  status: TaskStatus;
  completedAt: number | null;
  recurrence: Recurrence;
  subtasks: Subtask[];
  noteIds: string[];
  /** Minutes before the deadline to notify; null = no reminder. */
  reminder: number | null;
  favorite: boolean;
  sourceUrl: string;
}

export interface Template extends BaseRecord {
  type: 'template';
  name: string;
  description: string;
  icon: string;
  color: NoteColor;
  html: string;
  builtin?: boolean;
}

export interface Settings extends BaseRecord {
  type: 'settings';
  theme: 'system' | 'light' | 'dark';
  accent: Accent;
  noteColor: NoteColor;
  font: FontKey;
  fontSize: 'sm' | 'md' | 'lg';
  notifications: boolean;
  defaultReminder: number | null;
  weekStart: 0 | 1;
  autoBackup: 'off' | 'daily' | 'weekly' | 'monthly';
  dashboard: { order: Widget[]; hidden: Widget[] };
}

export type AnyRecord = Note | Folder | Task | Template | Settings;

export const uid = (): string => crypto.randomUUID();

const base = (type: RecordType, now: number) => ({ id: uid(), type, createdAt: now, updatedAt: now, deletedAt: null });

export function newNote(patch: Partial<Note> = {}, now = Date.now()): Note {
  return {
    ...base('note', now),
    type: 'note',
    title: '',
    html: '',
    text: '',
    color: 'yellow',
    folderId: null,
    pinned: false,
    favorite: false,
    scope: 'none',
    url: '',
    host: '',
    pos: null,
    minimized: false,
    font: '',
    ...patch,
  };
}

export function newFolder(patch: Partial<Folder> = {}, now = Date.now()): Folder {
  return { ...base('folder', now), type: 'folder', name: 'New folder', color: 'blue', ...patch };
}

export function newTask(patch: Partial<Task> = {}, now = Date.now()): Task {
  return {
    ...base('task', now),
    type: 'task',
    title: '',
    description: '',
    start: '',
    due: '',
    dueTime: '',
    priority: 'medium',
    category: '',
    tags: [],
    status: 'pending',
    completedAt: null,
    recurrence: 'none',
    subtasks: [],
    noteIds: [],
    reminder: null,
    favorite: false,
    sourceUrl: '',
    ...patch,
  };
}

export function newTemplate(patch: Partial<Template> = {}, now = Date.now()): Template {
  return { ...base('template', now), type: 'template', name: 'New template', description: '', icon: '📝', color: 'yellow', html: '', ...patch };
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    type: 'settings',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    theme: 'system',
    accent: 'indigo',
    noteColor: 'yellow',
    font: 'sans',
    fontSize: 'md',
    notifications: true,
    defaultReminder: 15,
    weekStart: 1,
    autoBackup: 'weekly',
    dashboard: { order: [...WIDGETS], hidden: [] },
  };
}

/** Turns a record into the stub left behind by a permanent delete. */
export function tombstone(record: AnyRecord, now = Date.now()): AnyRecord {
  return {
    id: record.id,
    type: record.type,
    createdAt: record.createdAt,
    updatedAt: Math.max(now, record.updatedAt + 1),
    deletedAt: record.deletedAt ?? now,
    purged: true,
  } as AnyRecord;
}

// ---------------------------------------------------------------------------
// Validation: anything that arrives from a backup file or the cloud is coerced
// into a well-formed record, or rejected.

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown) => v === true;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
const dateOr = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const timeOr = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function validateRecord(raw: unknown): AnyRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const type = oneOf<RecordType | ''>(r.type, ['note', 'folder', 'task', 'template', 'settings'], '');
  if (!type || typeof r.id !== 'string' || !r.id || r.id.length > 128 || /[/\s]/.test(r.id)) return null;
  if (type === 'settings' && r.id !== 'settings') return null;

  const common = {
    id: r.id,
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null,
  };
  if (r.purged === true) return { ...common, type, purged: true } as AnyRecord;

  switch (type) {
    case 'note': {
      const pos = r.pos && typeof r.pos === 'object' ? { x: num(r.pos.x), y: num(r.pos.y), w: num(r.pos.w, 260), h: num(r.pos.h, 240) } : null;
      return {
        ...common,
        type,
        title: str(r.title),
        html: str(r.html),
        text: str(r.text),
        color: oneOf(r.color, NOTE_COLORS, 'yellow'),
        folderId: typeof r.folderId === 'string' ? r.folderId : null,
        pinned: bool(r.pinned),
        favorite: bool(r.favorite),
        scope: oneOf<NoteScope>(r.scope, ['none', 'page', 'site', 'all'], 'none'),
        url: str(r.url),
        host: str(r.host),
        pos,
        minimized: bool(r.minimized),
        font: oneOf<FontKey | ''>(r.font, ['sans', 'serif', 'mono', 'hand', ''], ''),
      };
    }
    case 'folder':
      return { ...common, type, name: str(r.name, 'Folder'), color: oneOf(r.color, NOTE_COLORS, 'blue') };
    case 'task':
      return {
        ...common,
        type,
        title: str(r.title),
        description: str(r.description),
        start: dateOr(r.start),
        due: dateOr(r.due),
        dueTime: timeOr(r.dueTime),
        priority: oneOf<Priority>(r.priority, PRIORITIES, 'medium'),
        category: str(r.category),
        tags: strings(r.tags),
        status: oneOf<TaskStatus>(r.status, ['pending', 'in_progress', 'completed'], 'pending'),
        completedAt: typeof r.completedAt === 'number' ? r.completedAt : null,
        recurrence: oneOf<Recurrence>(r.recurrence, RECURRENCES, 'none'),
        subtasks: Array.isArray(r.subtasks)
          ? r.subtasks.filter((s: any) => s && typeof s === 'object').map((s: any) => ({ id: str(s.id) || uid(), title: str(s.title), done: bool(s.done) }))
          : [],
        noteIds: strings(r.noteIds),
        reminder: typeof r.reminder === 'number' ? r.reminder : null,
        favorite: bool(r.favorite),
        sourceUrl: str(r.sourceUrl),
      };
    case 'template':
      return {
        ...common,
        type,
        name: str(r.name, 'Template'),
        description: str(r.description),
        icon: str(r.icon, '📝').slice(0, 8),
        color: oneOf(r.color, NOTE_COLORS, 'yellow'),
        html: str(r.html),
      };
    case 'settings': {
      const d = defaultSettings();
      const order = strings(r.dashboard?.order).filter((w): w is Widget => (WIDGETS as readonly string[]).includes(w));
      for (const w of WIDGETS) if (!order.includes(w)) order.push(w);
      return {
        ...common,
        id: 'settings',
        type,
        theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, d.theme),
        accent: oneOf(r.accent, Object.keys(ACCENTS) as Accent[], d.accent),
        noteColor: oneOf(r.noteColor, NOTE_COLORS, d.noteColor),
        font: oneOf(r.font, ['sans', 'serif', 'mono', 'hand'] as const, d.font),
        fontSize: oneOf(r.fontSize, ['sm', 'md', 'lg'] as const, d.fontSize),
        notifications: r.notifications !== false,
        defaultReminder: typeof r.defaultReminder === 'number' ? r.defaultReminder : r.defaultReminder === null ? null : d.defaultReminder,
        weekStart: r.weekStart === 0 ? 0 : 1,
        autoBackup: oneOf(r.autoBackup, ['off', 'daily', 'weekly', 'monthly'] as const, d.autoBackup),
        dashboard: {
          order,
          hidden: strings(r.dashboard?.hidden).filter((w): w is Widget => (WIDGETS as readonly string[]).includes(w)),
        },
      };
    }
  }
  return null;
}
