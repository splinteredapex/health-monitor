import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { todayLocal, type LocalDate } from '../lib/dates';
import type { EngineInput, RecordData } from '../domain/programme';
import { DEFAULT_GOALS } from '../db/repo';

/** Today's local date; re-evaluates on focus and every minute (handles midnight). */
export function useToday(): LocalDate {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const tick = () => setToday((prev) => (todayLocal() !== prev ? todayLocal() : prev));
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);
  return today;
}

export const useProfile = () => useLiveQuery(() => db.userProfile.get('profile'), [], null);
export function useGoals() {
  const g = useLiveQuery(() => db.healthGoals.get('goals'), []);
  return g ?? DEFAULT_GOALS(0);
}

export function useRecordData(): RecordData | undefined {
  const bp = useLiveQuery(() => db.bloodPressure.orderBy('takenAt').toArray(), []);
  const weights = useLiveQuery(() => db.weights.orderBy('takenAt').toArray(), []);
  const waists = useLiveQuery(() => db.waists.orderBy('takenAt').toArray(), []);
  const exercise = useLiveQuery(() => db.exercise.orderBy('localDate').toArray(), []);
  const sleep = useLiveQuery(() => db.sleep.orderBy('wakeDate').toArray(), []);
  const nutrition = useLiveQuery(() => db.nutrition.orderBy('localDate').toArray(), []);
  const reviews = useLiveQuery(() => db.weeklyReviews.toArray(), []);
  return useMemo(() => {
    if (!bp || !weights || !waists || !exercise || !sleep || !nutrition || !reviews) return undefined;
    return { bp, weights, waists, exercise, sleep, nutrition, reviews };
  }, [bp, weights, waists, exercise, sleep, nutrition, reviews]);
}

export const useDailyMetrics = () => useLiveQuery(() => db.dailyMetrics.orderBy('localDate').toArray(), []);
export const useWeeks = () => useLiveQuery(() => db.programmeWeeks.orderBy('weekNumber').toArray(), []);

export function useEngine(): (EngineInput & { ready: true }) | undefined {
  const today = useToday();
  const profile = useProfile();
  const data = useRecordData();
  const activities = useLiveQuery(() => db.scheduledActivities.toArray(), []);
  const completions = useLiveQuery(() => db.activityCompletions.toArray(), []);
  return useMemo(() => {
    if (!profile || !data || !activities || !completions) return undefined;
    return { ready: true as const, startDate: profile.programmeStartDate, activities, completions, data, today };
  }, [profile, data, activities, completions, today]);
}
