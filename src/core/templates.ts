import { addDays, parseDate, startOfWeek, today } from './dates';
import { newNote, type Note, type Settings, type Template } from './types';

const check = (...items: string[]) => `<ul class="checklist">${items.map((i) => `<li>${i || '<br>'}</li>`).join('')}</ul>`;
const list = (...items: string[]) => `<ul>${items.map((i) => `<li>${i || '<br>'}</li>`).join('')}</ul>`;
const h = (text: string) => `<h2>${text}</h2>`;
const line = (text = '') => `<div>${text || '<br>'}</div>`;

const builtin = (slug: string, icon: string, name: string, description: string, color: Template['color'], html: string): Template => ({
  id: `builtin:${slug}`,
  type: 'template',
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  builtin: true,
  icon,
  name,
  description,
  color,
  html,
});

export const BUILTIN_TEMPLATES: Template[] = [
  builtin('daily-planner', '🗓️', 'Daily Planner', 'Top priorities, schedule and notes for one day.', 'yellow',
    `<h1>Daily plan — {{date}}</h1>${h('Top 3 priorities')}${check('', '', '')}${h('Schedule')}${list('Morning — ', 'Afternoon — ', 'Evening — ')}${h('Notes')}${line()}${h('Wins of the day')}${line()}`),
  builtin('weekly-planner', '📅', 'Weekly Planner', 'Goals and a day-by-day plan for the week.', 'blue',
    `<h1>Week of {{week}}</h1>${h('Goals this week')}${check('', '', '')}${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend'].map((d) => `<h3>${d}</h3>${check('')}`).join('')}${h('Review')}${list('What went well: ', 'What to improve: ')}`),
  builtin('monthly-goals', '🎯', 'Monthly Goals', 'Three goals with steps, plus habits to keep.', 'green',
    `<h1>Goals — {{month}}</h1>${[1, 2, 3].map((n) => `${h(`Goal ${n}`)}${line('Why it matters: ')}${check('First step', 'Next step')}`).join('')}${h('Habits to keep')}${check('', '')}${h('End-of-month review')}${line()}`),
  builtin('meeting-notes', '🤝', 'Meeting Notes', 'Agenda, discussion, decisions and action items.', 'purple',
    `<h1>Meeting — {{date}}</h1>${line('<b>Topic:</b> ')}${line('<b>Attendees:</b> ')}${h('Agenda')}<ol><li><br></li><li><br></li></ol>${h('Discussion')}${line()}${h('Decisions')}${list('')}${h('Action items')}${check('Owner — task — due', '')}`),
  builtin('project-tracker', '📊', 'Project Tracker', 'Goal, milestones, risks and next steps for a project.', 'orange',
    `<h1>Project: </h1>${line('<b>Goal:</b> ')}${line('<b>Deadline:</b> ')}${line('<b>Status:</b> On track')}${h('Milestones')}${check('Milestone 1 — date', 'Milestone 2 — date', 'Milestone 3 — date')}${h('In progress')}${list('')}${h('Risks and blockers')}${list('')}${h('Next steps')}${check('', '')}`),
  builtin('daily-todo', '✅', 'Daily To-Do List', 'A simple must-do / should-do / could-do list.', 'yellow',
    `<h1>To-do — {{date}}</h1>${h('Must do')}${check('', '')}${h('Should do')}${check('', '')}${h('Could do')}${check('')}`),
  builtin('research-notes', '🔎', 'Research Notes', 'Question, sources, findings and open questions.', 'blue',
    `<h1>Research: </h1>${line('<b>Question:</b> ')}${h('Sources')}${list('Title — link')}${h('Key findings')}${list('', '')}${h('Quotes')}<blockquote><br></blockquote>${h('Open questions')}${check('')}${h('Summary')}${line()}`),
  builtin('shopping-list', '🛒', 'Shopping List', 'Groceries grouped by section, ready to tick off.', 'green',
    `<h1>Shopping list</h1>${h('Fruit and vegetables')}${check('', '')}${h('Dairy and bakery')}${check('', '')}${h('Pantry')}${check('', '')}${h('Household')}${check('')}${h('Other')}${check('')}`),
  builtin('personal-journal', '📔', 'Personal Journal', 'Mood, gratitude and reflections for the day.', 'pink',
    `<h1>{{weekday}}, {{date}}</h1>${line('<b>Mood:</b> ')}${h('Grateful for')}<ol><li><br></li><li><br></li><li><br></li></ol>${h('What happened today')}${line()}${h('What I learned')}${line()}${h('Tomorrow I will')}${check('')}`),
  builtin('follow-up-tracker', '📨', 'Follow-up Tracker', 'People to follow up with, and when.', 'orange',
    `<h1>Follow-ups</h1>${line('One line per follow-up: <b>who — what — contacted on — follow up by</b>')}${h('Waiting for a reply')}${check('Name — topic — sent {{date}} — follow up by ', '')}${h('To contact')}${check('', '')}${h('Done')}${check('')}`),
  builtin('custom-checklist', '☑️', 'Custom Checklist', 'A blank checklist to make your own.', 'gray',
    `<h1>Checklist</h1>${check('First item', '', '')}`),
];

function fill(html: string, now: number): string {
  const t = today(now);
  const d = parseDate(t);
  const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) => date.toLocaleDateString(undefined, opts);
  const monday = parseDate(startOfWeek(t, 1));
  return html
    .replaceAll('{{date}}', fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }))
    .replaceAll('{{weekday}}', fmt(d, { weekday: 'long' }))
    .replaceAll('{{month}}', fmt(d, { month: 'long', year: 'numeric' }))
    .replaceAll('{{week}}', `${fmt(monday, { day: 'numeric', month: 'short' })} – ${fmt(parseDate(addDays(startOfWeek(t, 1), 6)), { day: 'numeric', month: 'short' })}`);
}

const plain = (html: string) =>
  html
    .replace(/<\/(div|li|h1|h2|h3|p|blockquote)>|<br>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n')
    .trim();

/** Creates a new note from a template (built-in or custom). */
export function noteFromTemplate(template: Template, settings: Settings, now = Date.now()): Note {
  const html = fill(template.html, now);
  return newNote({ title: template.name, html, text: plain(html), color: template.color ?? settings.noteColor }, now);
}
