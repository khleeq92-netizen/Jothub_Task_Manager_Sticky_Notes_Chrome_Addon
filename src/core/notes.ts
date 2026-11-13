import type { Note } from './types';

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain text → the simple div-per-line HTML the editor produces. */
export const textToHtml = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => `<div>${escapeHtml(line) || '<br>'}</div>`)
    .join('');

/** Same page = same origin, path and query. The #fragment is ignored. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/+$/, '') + u.search;
  } catch {
    return url;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function noteMatchesUrl(note: Note, url: string): boolean {
  if (note.deletedAt || note.purged) return false;
  switch (note.scope) {
    case 'all':
      return true;
    case 'site':
      return !!note.host && note.host.replace(/^www\./, '') === hostOf(url);
    case 'page':
      return !!note.url && normalizeUrl(note.url) === normalizeUrl(url);
    default:
      return false;
  }
}

export function noteTitle(note: Pick<Note, 'title' | 'text'>): string {
  if (note.title.trim()) return note.title.trim();
  const firstLine = note.text.split('\n').find((line) => line.trim());
  return firstLine ? firstLine.trim().slice(0, 60) : 'Untitled note';
}

export function scopeLabel(note: Note): string {
  switch (note.scope) {
    case 'all':
      return 'All websites';
    case 'site':
      return note.host || 'A website';
    case 'page':
      return note.host ? `Page on ${note.host}` : 'A page';
    default:
      return '';
  }
}
