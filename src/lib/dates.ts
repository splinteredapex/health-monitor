/**
 * Local-date utilities.
 *
 * Health records are keyed by the user's *local calendar date* ("YYYY-MM-DD") at
 * the moment of recording, plus an absolute epoch-ms timestamp. Calendar
 * arithmetic is done on date strings via UTC midnight so it is immune to DST
 * (a local day can be 23 or 25 hours long; a calendar day is always one day).
 */

export type LocalDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:mm

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isLocalTime(s: unknown): s is LocalTime {
  return typeof s === 'string' && TIME_RE.test(s);
}

/** Local calendar date of an instant, in the device time zone. */
export function toLocalDate(d: Date = new Date()): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalTime(d: Date = new Date()): LocalTime {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

function parts(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Build a Date for a local wall-clock time. Handles DST via the JS engine. */
export function localDateTimeToDate(date: LocalDate, time: LocalTime): Date {
  const [y, mo, d] = parts(date);
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, mo, d] = parts(date);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Whole calendar days from a to b (b - a). DST-safe. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dateRange(start: LocalDate, endInclusive: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const n = diffDays(start, endInclusive);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** UK display: DD/MM/YYYY */
export function formatDateUK(date: LocalDate): string {
  const [y, mo, d] = parts(date);
  return `${pad(d)}/${pad(mo)}/${y}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayName(date: LocalDate): string {
  const [y, mo, d] = parts(date);
  return DAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!;
}

/** "Sat 31 Oct" */
export function formatDateShort(date: LocalDate): string {
  const [, mo, d] = parts(date);
  return `${weekdayName(date)} ${d} ${MONTHS[mo - 1]}`;
}

/** "31 Oct" for chart axes */
export function formatDayMonth(date: LocalDate): string {
  const [, mo, d] = parts(date);
  return `${d} ${MONTHS[mo - 1]}`;
}

export function parseUKDate(s: string): LocalDate | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isLocalDate(iso) ? iso : null;
}

export function ageOn(dob: LocalDate, on: LocalDate): number {
  const [y1, m1, d1] = parts(dob);
  const [y2, m2, d2] = parts(on);
  let age = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) age--;
  return age;
}

export function minutesToHM(mins: number): string {
  const sign = mins < 0 ? '-' : '';
  const m = Math.abs(Math.round(mins));
  return `${sign}${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

export function hourOf(time: LocalTime): number {
  return Number(time.slice(0, 2));
}
