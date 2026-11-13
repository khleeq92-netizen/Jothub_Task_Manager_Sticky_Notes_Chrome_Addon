import { noteFromTemplate } from '../core/templates';
import { newNote, newTask, type Note, type Task, type Template } from '../core/types';
import { platform } from '../platform';
import { getData, saveRecord } from './store';
import { go, toast } from './ui';

export function createNote(change: Partial<Note> = {}, open = true): Note {
  const { settings } = getData();
  const note = saveRecord(newNote({ color: settings.noteColor, font: settings.font === 'sans' ? '' : settings.font, ...change }));
  if (open) go('notes', note.id);
  return note;
}

export function createTask(change: Partial<Task> = {}, open = true): Task {
  const { settings } = getData();
  const task = saveRecord(newTask({ ...change, reminder: change.reminder !== undefined ? change.reminder : change.due ? settings.defaultReminder : null }));
  if (open) go('tasks', task.id);
  return task;
}

export function applyTemplate(template: Template) {
  const note = saveRecord(noteFromTemplate(template, getData().settings));
  go('notes', note.id);
}

/** Drops a floating sticky note onto the page in the active tab. */
export async function stickyOnPage() {
  const ok = await platform.tabs.sendToActive({ type: 'jh-new-note', text: '' });
  if (ok) toast('Sticky note added to the page');
  else toast('Notes cannot float on this page. Open a normal website and try again.');
}

export const requestSync = (full = false) => platform.runtime.send({ type: 'sync-now', full }).catch(() => null);
