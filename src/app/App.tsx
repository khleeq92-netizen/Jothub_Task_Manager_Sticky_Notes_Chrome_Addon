import {
  AppWindow, CalendarDays, CheckSquare, ExternalLink, FilePlus2, FileText, Folder, Globe, LayoutDashboard, LayoutTemplate, ListPlus, PanelRight, Search, Settings as SettingsIcon, Star, StickyNote, Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { noteTitle } from '../core/notes';
import { displayStatus } from '../core/tasks';
import { BUILTIN_TEMPLATES } from '../core/templates';
import { ACCENTS } from '../core/types';
import { platform } from '../platform';
import { applyTemplate, createNote, createTask, stickyOnPage } from './actions';
import { useData, useNow } from './store';
import { ConfirmHost, go, IconButton, Toasts, toast, useRoute, type ViewName } from './ui';
import { FavoritesView, FoldersView, NotesView, TemplatesView, TrashView } from './views/library';
import { CalendarView, DashboardView, TasksView, useSync } from './views/planner';
import { SettingsView } from './views/settings';

const NAV: { view: ViewName; label: string; icon: JSX.Element }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { view: 'notes', label: 'My Notes', icon: <FileText size={18} /> },
  { view: 'folders', label: 'Folders', icon: <Folder size={18} /> },
  { view: 'tasks', label: 'Tasks', icon: <CheckSquare size={18} /> },
  { view: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
  { view: 'templates', label: 'Templates', icon: <LayoutTemplate size={18} /> },
  { view: 'favorites', label: 'Favorites', icon: <Star size={18} /> },
  { view: 'trash', label: 'Trash', icon: <Trash2 size={18} /> },
  { view: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
];

const surface = () => document.documentElement.dataset.surface ?? 'tab';

export function App() {
  const data = useData();
  const route = useRoute();
  const sync = useSync();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { settings } = data;

  // Theme, accent and note text size.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      root.style.setProperty('--accent-base', ACCENTS[settings.accent]);
      root.style.setProperty('--note-size', { sm: '13px', md: '14.5px', lg: '16.5px' }[settings.fontSize]);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.accent, settings.fontSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
        e.preventDefault();
        createNote();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') {
        e.preventDefault();
        createTask();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const has = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(q));
    return {
      notes: data.notes.filter((n) => has(n.title, n.text)).slice(0, 6),
      tasks: data.tasks.filter((t) => has(t.title, t.description, t.category, t.tags.join(' '))).slice(0, 6),
      templates: [...data.templates, ...BUILTIN_TEMPLATES].filter((t) => has(t.name, t.description)).slice(0, 4),
    };
  }, [query, data.notes, data.tasks, data.templates]);

  const overdue = data.tasks.filter((t) => displayStatus(t, now) === 'overdue').length;
  const pick = (run: () => void) => {
    run();
    setQuery('');
    setSearchOpen(false);
    searchRef.current?.blur();
  };

  const openPanel = () =>
    platform.sidePanel
      .open()
      .then(() => surface() === 'popup' && window.close())
      .catch((e) => toast(e?.message ?? 'The side panel could not be opened.'));

  if (!data.ready) return <div className="loading" aria-busy="true" />;

  let view: JSX.Element;
  switch (route.view) {
    case 'notes':
      view = <NotesView id={route.id} />;
      break;
    case 'folders':
      view = <FoldersView />;
      break;
    case 'tasks':
      view = <TasksView id={route.id} />;
      break;
    case 'calendar':
      view = <CalendarView />;
      break;
    case 'templates':
      view = <TemplatesView />;
      break;
    case 'favorites':
      view = <FavoritesView />;
      break;
    case 'trash':
      view = <TrashView />;
      break;
    case 'settings':
      view = <SettingsView section={route.id} />;
      break;
    default:
      view = <DashboardView />;
  }

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand"><StickyNote size={20} /><span>Task-Mark-stickynote</span></div>
        {NAV.map((item) => (
          <button key={item.view} className={`nav-item ${route.view === item.view ? 'active' : ''}`} aria-current={route.view === item.view ? 'page' : undefined} title={item.label} onClick={() => go(item.view)}>
            {item.icon}
            <span>{item.label}</span>
            {item.view === 'tasks' && overdue > 0 && <em className="nav-count bad" aria-label={`${overdue} overdue`}>{overdue}</em>}
            {item.view === 'trash' && data.trash.length > 0 && <em className="nav-count">{data.trash.length}</em>}
          </button>
        ))}
        <button className={`sync-chip tone-${sync.tone}`} title={sync.status.error ?? sync.label} onClick={() => go('settings', 'cloud')}>
          <span className="sync-dot" />
          <span>{sync.label}</span>
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSearchOpen(false)}>
            <Search size={16} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search notes, tasks, templates"
              aria-label="Search everything"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            />
            <kbd className="hint">Ctrl K</kbd>
            {searchOpen && results && (
              <div className="search-results" role="listbox" aria-label="Search results">
                {!results.notes.length && !results.tasks.length && !results.templates.length && <p className="muted small pad">Nothing matches “{query.trim()}”.</p>}
                {results.notes.length > 0 && <div className="result-group">Notes</div>}
                {results.notes.map((n) => (
                  <button key={n.id} role="option" aria-selected="false" onClick={() => pick(() => go('notes', n.id))}><FileText size={15} /><span className="ellipsis">{noteTitle(n)}</span></button>
                ))}
                {results.tasks.length > 0 && <div className="result-group">Tasks</div>}
                {results.tasks.map((t) => (
                  <button key={t.id} role="option" aria-selected="false" onClick={() => pick(() => go('tasks', t.id))}><CheckSquare size={15} /><span className={`ellipsis ${t.status === 'completed' ? 'struck' : ''}`}>{t.title || 'Untitled task'}</span></button>
                ))}
                {results.templates.length > 0 && <div className="result-group">Templates</div>}
                {results.templates.map((t) => (
                  <button key={t.id} role="option" aria-selected="false" onClick={() => pick(() => applyTemplate(t))}><LayoutTemplate size={15} /><span className="ellipsis">{t.name}</span><span className="muted small">Use</span></button>
                ))}
              </div>
            )}
          </div>
          <div className="quick-bar" role="toolbar" aria-label="Quick actions">
            <button className="btn primary compact" title="New note (Alt+N)" onClick={() => createNote()}><FilePlus2 size={16} /><span>Note</span></button>
            <button className="btn compact" title="New task (Alt+T)" onClick={() => createTask()}><ListPlus size={16} /><span>Task</span></button>
            {platform.name === 'chrome' && <IconButton label="Floating note on the current page" onClick={() => void stickyOnPage()}><Globe size={17} /></IconButton>}
            {platform.sidePanel.supported && surface() !== 'panel' && <IconButton label="Keep open in the side panel" onClick={() => void openPanel()}><PanelRight size={17} /></IconButton>}
            {surface() !== 'window' && <IconButton label="Open in a floating window" onClick={() => void platform.windows.popout(platform.runtime.url('app.html') + '?surface=window' + location.hash, 480, 720)}><AppWindow size={17} /></IconButton>}
            {surface() !== 'tab' && <IconButton label="Open the full hub in a tab" onClick={() => void platform.tabs.open(platform.runtime.url('app.html') + location.hash)}><ExternalLink size={17} /></IconButton>}
          </div>
        </header>
        <main className="content" key={route.view}>{view}</main>
      </div>
      <Toasts />
      <ConfirmHost />
    </div>
  );
}
