import { beforeEach, describe, expect, it } from 'vitest';
import { getRecords, getStickyIds, loadAll, save } from '../src/core/db';
import { htmlToMarkdown } from '../src/core/exporters';
import { normalizeUrl, noteMatchesUrl, noteTitle, textToHtml } from '../src/core/notes';
import { sanitizeHtml } from '../src/core/sanitize';
import { BUILTIN_TEMPLATES, noteFromTemplate } from '../src/core/templates';
import { defaultSettings, newNote, tombstone, validateRecord } from '../src/core/types';
import { freshDevice } from './helpers';

beforeEach(() => void freshDevice());

describe('notes storage', () => {
  it('saves, reloads and updates a note', async () => {
    const [note] = await save(newNote({ title: 'Groceries', text: 'milk' }));
    expect((await loadAll()).map((r) => r.id)).toEqual([note.id]);
    const [edited] = await save({ ...note, text: 'milk and eggs' });
    expect(edited.updatedAt).toBeGreaterThan(note.updatedAt);
    expect(((await getRecords([note.id]))[0] as typeof note).text).toBe('milk and eggs');
  });

  it('tracks which notes float on pages', async () => {
    const [plain] = await save(newNote());
    const [sticky] = await save(newNote({ scope: 'page', url: 'https://example.com/a' }));
    expect(await getStickyIds()).toEqual([sticky.id]);
    await save({ ...sticky, deletedAt: Date.now() });
    await save({ ...plain, scope: 'all' });
    expect(await getStickyIds()).toEqual([plain.id]);
  });

  it('keeps only a stub after a permanent delete', async () => {
    const [note] = await save(newNote({ title: 'secret', html: '<b>secret</b>', text: 'secret' }));
    const stub = tombstone(note);
    expect(stub.purged).toBe(true);
    expect(JSON.stringify(stub)).not.toContain('secret');
    expect(stub.updatedAt).toBeGreaterThan(note.updatedAt);
  });
});

describe('attaching notes to pages', () => {
  const page = newNote({ scope: 'page', url: 'https://example.com/docs/?q=1#intro', host: 'example.com' });
  const site = newNote({ scope: 'site', host: 'www.example.com' });
  const all = newNote({ scope: 'all' });

  it('matches the same page whatever the #fragment or trailing slash', () => {
    expect(normalizeUrl('https://example.com/docs/?q=1#intro')).toBe('https://example.com/docs?q=1');
    expect(noteMatchesUrl(page, 'https://example.com/docs?q=1#other')).toBe(true);
    expect(noteMatchesUrl(page, 'https://example.com/docs?q=2')).toBe(false);
    expect(noteMatchesUrl(page, 'https://example.com/other')).toBe(false);
  });

  it('matches a whole site with or without www', () => {
    expect(noteMatchesUrl(site, 'https://example.com/anything')).toBe(true);
    expect(noteMatchesUrl(site, 'https://sub.example.com/')).toBe(false);
    expect(noteMatchesUrl(all, 'https://whatever.org/')).toBe(true);
  });

  it('never shows trashed or unattached notes', () => {
    expect(noteMatchesUrl({ ...all, deletedAt: 1 }, 'https://a.com')).toBe(false);
    expect(noteMatchesUrl(newNote(), 'https://a.com')).toBe(false);
  });
});

describe('note content', () => {
  it('strips scripts, handlers and unknown attributes but keeps formatting', () => {
    const dirty = '<p onclick="steal()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=alert(1)></p><ul class="checklist"><li data-checked="true" style="x">done</li></ul><a href="javascript:alert(1)">x</a><a href="https://ok.example">ok</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|<img|style=/i);
    expect(clean).toContain('<b>there</b>');
    expect(clean).toContain('<ul class="checklist"><li data-checked="true">done</li></ul>');
    expect(clean).toContain('href="https://ok.example"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('exports checklists and headings to Markdown', () => {
    const md = htmlToMarkdown('<h1>Plan</h1><ul class="checklist"><li data-checked="true">one</li><li>two</li></ul><div>Some <b>bold</b> text</div>');
    expect(md).toContain('# Plan');
    expect(md).toContain('- [x] one');
    expect(md).toContain('- [ ] two');
    expect(md).toContain('Some **bold** text');
  });

  it('derives a title and escapes plain text', () => {
    expect(noteTitle({ title: '', text: '\n  First line\nsecond' })).toBe('First line');
    expect(noteTitle({ title: '', text: '' })).toBe('Untitled note');
    expect(textToHtml('a <b>\nc')).toBe('<div>a &lt;b&gt;</div><div>c</div>');
  });

  it('offers the eleven built-in templates and fills in dates', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual([
      'Daily Planner', 'Weekly Planner', 'Monthly Goals', 'Meeting Notes', 'Project Tracker', 'Daily To-Do List',
      'Research Notes', 'Shopping List', 'Personal Journal', 'Follow-up Tracker', 'Custom Checklist',
    ]);
    for (const template of BUILTIN_TEMPLATES) {
      const note = noteFromTemplate(template, defaultSettings(), new Date(2026, 10, 13, 10).getTime());
      expect(note.html).not.toContain('{{');
      expect(sanitizeHtml(note.html)).toBe(note.html); // templates are already safe HTML
      expect(note.text.length).toBeGreaterThan(5);
    }
    expect(noteFromTemplate(BUILTIN_TEMPLATES[0], defaultSettings(), new Date(2026, 10, 13).getTime()).html).toContain('2026');
  });
});

describe('record validation', () => {
  it('rejects junk and repairs bad fields', () => {
    expect(validateRecord(null)).toBeNull();
    expect(validateRecord({ type: 'virus', id: 'x' })).toBeNull();
    expect(validateRecord({ type: 'note', id: 'a/b' })).toBeNull();
    const note = validateRecord({ type: 'note', id: 'n1', color: 'neon', scope: 'galaxy', pinned: 'yes', html: 42 });
    expect(note).toMatchObject({ color: 'yellow', scope: 'none', pinned: false, html: '' });
    const task = validateRecord({ type: 'task', id: 't1', due: 'tomorrow', priority: 'max', tags: ['a', 1], subtasks: [{ title: 'x' }, null] });
    expect(task).toMatchObject({ due: '', priority: 'medium', tags: ['a'] });
    expect((task as any).subtasks).toHaveLength(1);
  });
});
