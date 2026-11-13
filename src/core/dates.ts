// Dates are stored as local 'YYYY-MM-DD' strings so a deadline means the same
// calendar day wherever the data syncs to.

const pad = (n: number) => String(n).padStart(2, '0');

export const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = (now = Date.now()) => dateStr(new Date(now));

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateStr(d);
}

export function startOfWeek(s: string, weekStart: 0 | 1): string {
  const diff = (parseDate(s).getDay() - weekStart + 7) % 7;
  return addDays(s, -diff);
}

export const startOfMonth = (s: string) => s.slice(0, 8) + '01';

export function friendlyDate(s: string, now = Date.now()): string {
  if (!s) return '';
  const t = today(now);
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function friendlyTime(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(ts: number, now = Date.now()): string {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / 1440)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const longDate = (now = Date.now()) =>
  new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
