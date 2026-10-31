import type { ExerciseSession, ExerciseType } from '../db/schemas';
import { sum } from '../lib/math';

export const AEROBIC_TYPES: readonly ExerciseType[] = ['walking', 'running', 'cycling', 'swimming', 'other'];

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  walking: 'Walking', running: 'Running', cycling: 'Cycling', swimming: 'Swimming',
  strength: 'Strength', mobility: 'Mobility', other: 'Other',
};

export interface ExerciseTotals {
  sessions: number;
  totalMinutes: number;
  aerobicMinutes: number;
  easyAerobicMinutes: number;
  moderateMinutes: number;
  vigorousMinutes: number;
  /** NHS: 1 vigorous minute ≈ 2 moderate minutes. Aerobic sessions only. */
  moderateEquivalentMinutes: number;
  strengthSessions: number;
  mobilitySessions: number;
  plannedSessions: number;
  unplannedSessions: number;
}

/**
 * Weekly totals. Intensity is the user's perceived exertion – we never assume an
 * activity is moderate. Strength and mobility are excluded from aerobic minutes.
 */
export function exerciseTotals(sessions: readonly ExerciseSession[]): ExerciseTotals {
  const aerobic = sessions.filter((s) => AEROBIC_TYPES.includes(s.type));
  const mins = (xs: readonly ExerciseSession[]) => sum(xs.map((s) => s.durationMin));
  const moderate = mins(aerobic.filter((s) => s.intensity === 'moderate'));
  const vigorous = mins(aerobic.filter((s) => s.intensity === 'hard'));
  return {
    sessions: sessions.length,
    totalMinutes: mins(sessions),
    aerobicMinutes: mins(aerobic),
    easyAerobicMinutes: mins(aerobic.filter((s) => s.intensity === 'easy')),
    moderateMinutes: moderate,
    vigorousMinutes: vigorous,
    moderateEquivalentMinutes: moderate + 2 * vigorous,
    strengthSessions: sessions.filter((s) => s.type === 'strength').length,
    mobilitySessions: sessions.filter((s) => s.type === 'mobility').length,
    plannedSessions: sessions.filter((s) => s.planned).length,
    unplannedSessions: sessions.filter((s) => !s.planned).length,
  };
}
