import { ALERTS, describeDue, SNOOZE_OPTIONS, TEST_ALERT_ID, type AlertItem } from '../core/alerts';
import { getLocal, getRecords, save, setLocal, watchLocal, watchRecords } from '../core/db';
import { loadSettings } from '../core/settings';
import { completeTask, PRIORITY_LABEL } from '../core/tasks';
import { ACCENTS, type Task } from '../core/types';
import { platform } from '../platform';

// The reminder pop-up (alert.html). Opened by the background worker in its own
// small window in front of whatever the user is doing. Plain DOM, no React,
// so it appears instantly.

const list = document.getElementById('list')!;
const heading = document.getElementById('heading')!;
let silenced = false;

/** Any click or key press means the user has seen it: stop the chime. */
function silence() {
  if (silenced) return;
  silenced = true;
  void platform.runtime.send({ type: 'stop-sound' }).catch(() => {});
}
document.addEventListener('pointerdown', silence, true);
document.addEventListener('click', silence, true);
document.addEventListener('keydown', silence, true);

async function remove(taskId: string) {
  const alerts = await getLocal<AlertItem[]>(ALERTS, []);
  const rest = alerts.filter((a) => a.taskId !== taskId);
  await setLocal(ALERTS, rest);
  if (!rest.length) window.close();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function button(label: string, className: string, onClick: () => void | Promise<void>) {
  const b = el('button', { type: 'button', className, textContent: label });
  b.addEventListener('click', () => {
    b.disabled = true;
    void Promise.resolve(onClick()).finally(() => (b.disabled = false));
  });
  return b;
}

function testCard() {
  return el(
    'article',
    { className: 'card' },
    el('h2', { textContent: 'This is a test reminder' }),
    el('p', { className: 'when', textContent: 'If you can see and hear this, reminders work on this browser profile.' }),
    el('div', { className: 'actions' }, button('Got it', 'btn primary', () => remove(TEST_ALERT_ID))),
  );
}

function taskCard(task: Task) {
  const snoozeRow = el('div', { className: 'snooze' }, el('span', { textContent: 'Snooze' }));
  for (const option of SNOOZE_OPTIONS) {
    snoozeRow.append(
      button(option.label, 'chip', async () => {
        await platform.runtime.send({ type: 'snooze', taskId: task.id, minutes: option.minutes });
        await remove(task.id);
      }),
    );
  }
  const details = task.description.trim();
  return el(
    'article',
    { className: `card p-${task.priority}` },
    el('div', { className: 'top' }, el('span', { className: 'badge', textContent: PRIORITY_LABEL[task.priority] }), task.category ? el('span', { className: 'cat', textContent: task.category }) : ''),
    el('h2', { textContent: task.title || 'Untitled task' }),
    el('p', { className: 'when', textContent: describeDue(task) }),
    details ? el('p', { className: 'desc', textContent: details.length > 220 ? `${details.slice(0, 220)}…` : details }) : '',
    el(
      'div',
      { className: 'actions' },
      button('✓ Mark done', 'btn primary', async () => {
        const [fresh] = (await getRecords([task.id])) as Task[];
        if (fresh && fresh.status !== 'completed') {
          const { done, next } = completeTask(fresh);
          await save(...(next ? [done, next] : [done]));
        }
        await remove(task.id);
      }),
      button('Open task', 'btn', async () => {
        await platform.runtime.send({ type: 'open-app', hash: `#/tasks/${task.id}` });
        await remove(task.id);
      }),
      button('Dismiss', 'btn ghost', () => remove(task.id)),
    ),
    snoozeRow,
  );
}

async function render() {
  const alerts = await getLocal<AlertItem[]>(ALERTS, []);
  const tasks = new Map(((await getRecords(alerts.map((a) => a.taskId).filter((id) => id !== TEST_ALERT_ID))) as Task[]).map((t) => [t.id, t]));
  const cards = alerts
    .map((a) => {
      if (a.taskId === TEST_ALERT_ID) return testCard();
      const task = tasks.get(a.taskId);
      return task && !task.deletedAt && task.status !== 'completed' ? taskCard(task) : null;
    })
    .filter((c): c is HTMLElement => !!c);
  if (!cards.length) {
    // Nothing left to show (handled elsewhere, or the window was reopened later).
    if (alerts.length) await setLocal(ALERTS, []);
    window.close();
    return;
  }
  const count = cards.length;
  heading.textContent = count === 1 ? 'Task reminder' : `${count} task reminders`;
  document.title = `⏰ ${count === 1 ? 'Task reminder' : `${count} reminders`} — Jot Hub`;
  list.replaceChildren(...cards);
}

async function start() {
  const settings = await loadSettings();
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', ACCENTS[settings.accent] ?? ACCENTS.indigo);
  await render();
  watchLocal(ALERTS, () => {
    silenced = false;
    void render();
  });
  // A task completed or edited elsewhere (another window, another device) updates the card.
  watchRecords(() => void render());
}

void start();
