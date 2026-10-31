/**
 * Native scheduled reminders (Android app only). Unlike the browser, these fire
 * even when the app is closed. Times are local; weekly reminders use the weekday
 * that corresponds to the chosen programme day.
 */
import { Capacitor } from '@capacitor/core';
import type { ReminderPrefs } from '../db/schemas';
import { addDays, type LocalDate } from '../lib/dates';

const IDS = { am: 101, pm: 102, ex: 103, weigh: 104, review: 105 };

const hm = (t: string) => ({ hour: Number(t.slice(0, 2)), minute: Number(t.slice(3, 5)) });
/** Capacitor weekday: 1 = Sunday … 7 = Saturday. */
export function weekdayForProgrammeDay(start: LocalDate, day: number): number {
  const d = addDays(start, day - 1);
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 1;
}

export const nativeNotificationsAvailable = () => Capacitor.isNativePlatform();

export async function scheduleNativeReminders(prefs: ReminderPrefs, start: LocalDate): Promise<'scheduled' | 'cleared' | 'denied'> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
  if (!prefs.enabled || !prefs.notifications) return 'cleared';
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  await LocalNotifications.schedule({
    notifications: [
      { id: IDS.am, title: 'Morning blood pressure', body: 'Sit quietly for 5 minutes, then take 2 readings about 1 minute apart.', schedule: { on: hm(prefs.bpMorning), allowWhileIdle: true } },
      { id: IDS.pm, title: 'Evening blood pressure', body: 'Time for your evening readings, if scheduled today.', schedule: { on: hm(prefs.bpEvening), allowWhileIdle: true } },
      { id: IDS.ex, title: 'Exercise', body: 'Check today’s plan – only if you feel well and pain-free.', schedule: { on: hm(prefs.exercise), allowWhileIdle: true } },
      { id: IDS.weigh, title: 'Weekly weigh-in', body: 'Weigh in after the toilet, before food.', schedule: { on: { weekday: weekdayForProgrammeDay(start, prefs.weighInDay), hour: 7, minute: 15 }, allowWhileIdle: true } },
      { id: IDS.review, title: 'Weekly review', body: 'Your weekly summary is ready in Progress.', schedule: { on: { weekday: weekdayForProgrammeDay(start, prefs.weeklyReviewDay), hour: 19, minute: 0 }, allowWhileIdle: true } },
    ],
  });
  return 'scheduled';
}
