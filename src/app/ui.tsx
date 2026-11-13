import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { NOTE_COLORS, NOTE_HEX, type NoteColor } from '../core/types';

// ---- routing (hash based, so it works in the popup, side panel and tabs) ----

export type ViewName = 'dashboard' | 'notes' | 'folders' | 'tasks' | 'calendar' | 'templates' | 'favorites' | 'trash' | 'settings';
const VIEWS: ViewName[] = ['dashboard', 'notes', 'folders', 'tasks', 'calendar', 'templates', 'favorites', 'trash', 'settings'];

const parseRoute = () => {
  const [view, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { view: (VIEWS as string[]).includes(view) ? (view as ViewName) : 'dashboard', id: id ? decodeURIComponent(id) : '' };
};
let route = parseRoute();
const routeListeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  route = parseRoute();
  routeListeners.forEach((l) => l());
});

export const useRoute = () =>
  useSyncExternalStore(
    (l) => {
      routeListeners.add(l);
      return () => routeListeners.delete(l);
    },
    () => route,
  );

export function go(view: ViewName, id = '') {
  location.hash = `#/${view}${id ? `/${encodeURIComponent(id)}` : ''}`;
}

// ---- toasts ------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(message: string, action?: Toast['action']) {
  const item = { id: Date.now() + Math.random(), message, action };
  toasts = [...toasts.slice(-2), item];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t !== item);
    emitToasts();
  }, action ? 6000 : 3200);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x !== t);
                emitToasts();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- confirm dialog ------------------------------------------------------------

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
let pending: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

export function confirmDialog(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { ...options, resolve };
    confirmListeners.forEach((l) => l());
  });
}

export function ConfirmHost() {
  const request = useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => pending,
  );
  if (!request) return null;
  const close = (ok: boolean) => {
    pending = null;
    confirmListeners.forEach((l) => l());
    request.resolve(ok);
  };
  return (
    <Modal title={request.title} onClose={() => close(false)} width={400}>
      <p className="muted" style={{ margin: 0 }}>{request.message}</p>
      <div className="modal-actions">
        <button className="btn" onClick={() => close(false)}>Cancel</button>
        <button className={`btn ${request.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => close(true)}>{request.confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ---- building blocks -------------------------------------------------------------

export function Modal({ title, onClose, children, width = 520, side = false }: { title: string; onClose: () => void; children: ReactNode; width?: number; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`overlay${side ? ' side' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ width }}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function IconButton({ label, onClick, children, active, className = '', disabled }: { label: string; onClick?: (e: React.MouseEvent) => void; children: ReactNode; active?: boolean; className?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  run: () => void;
  danger?: boolean;
}

export function Menu({ label, icon, items, align = 'right' }: { label: string; icon: ReactNode; items: (MenuItem | null)[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={`icon-btn ${open ? 'active' : ''}`} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
      </button>
      {open && (
        <div className={`menu ${align}`} role="menu">
          {items.map((item, i) =>
            item ? (
              <button
                key={i}
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ) : (
              <hr key={i} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function ColorDots({ value, onChange, label = 'Color' }: { value: NoteColor; onChange: (c: NoteColor) => void; label?: string }) {
  return (
    <div className="color-dots" role="group" aria-label={label}>
      {NOTE_COLORS.map((c) => (
        <button key={c} type="button" title={c} aria-label={c} aria-pressed={c === value} style={{ background: NOTE_HEX[c] }} onClick={() => onChange(c)}>
          {c === value && <Check size={12} />}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}
