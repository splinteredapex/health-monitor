import { intensityFromHr, localParts, mapBp, mapDaily, mapExercise, mapSleep, mapWeight } from './hcMap';
import { bpReadingSchema, exerciseSchema, sleepSchema, weightSchema } from '../db/schemas';
import { weekdayForProgrammeDay } from './notifications';
import { evaluateProtocol, homeOnly } from '../domain/bp';

describe('Health Connect mapping', () => {
  it('uses the record’s own zone offset for local date/time', () => {
    // 23:30 UTC with +01:00 offset is 00:30 next day local
    expect(localParts('2026-07-01T23:30:00Z', 3600)).toMatchObject({ date: '2026-07-02', time: '00:30', offsetMin: 60 });
    expect(localParts('2026-12-01T23:30:00Z', 0)).toMatchObject({ date: '2026-12-01', time: '23:30' });
  });
  it('maps BP as watch source, excluded from formal averages', () => {
    const r = mapBp({ id: 'abc', time: '2026-11-03T07:10:00Z', zoneOffsetSeconds: 0, systolic: 131.6, diastolic: 84.2 }, 1);
    expect(bpReadingSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ id: 'hc:abc', source: 'watch', systolic: 132, diastolic: 84, period: 'AM' });
    expect(homeOnly([r])).toHaveLength(0);
    expect(evaluateProtocol([r], '2026-11-02', '2026-11-10').provisional).toBeNull();
  });
  it('maps weight and sleep (overnight, with stages)', () => {
    expect(weightSchema.safeParse(mapWeight({ id: 'w', time: '2026-11-03T07:00:00Z', zoneOffsetSeconds: 0, kg: 85.94 }, 1)).success).toBe(true);
    const s = mapSleep({ id: 's', startTime: '2026-11-02T23:05:00Z', endTime: '2026-11-03T06:50:00Z', startZoneOffsetSeconds: 0, endZoneOffsetSeconds: 0, deepMin: 60, remMin: 90, awakeMin: 20 }, 1);
    expect(sleepSchema.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({ wakeDate: '2026-11-03', bedLocal: '2026-11-02T23:05', durationMin: 465, deepMin: 60, remMin: 90 });
  });
  it('never assumes moderate intensity without heart rate', () => {
    expect(intensityFromHr(null, 40)).toEqual({ intensity: 'easy', estimated: false });
    expect(intensityFromHr(110, 40).intensity).toBe('easy'); // 61% of 180
    expect(intensityFromHr(125, 40).intensity).toBe('moderate'); // 69%
    expect(intensityFromHr(150, 40).intensity).toBe('hard'); // 83%
    const e = mapExercise({ id: 'e', startTime: '2026-11-03T17:00:00Z', endTime: '2026-11-03T17:40:00Z', startZoneOffsetSeconds: 0, category: 'cycling', avgHr: 128, distanceM: 15230 }, 1, 40)!;
    expect(exerciseSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({ type: 'cycling', durationMin: 40, intensity: 'moderate', distanceKm: 15.23, planned: false, avgHeartRate: 128 });
    expect(mapExercise({ id: 'x', startTime: '2026-11-03T17:00:00Z', endTime: '2026-11-03T17:00:20Z', category: 'walking' }, 1, 40)).toBeNull();
    expect(mapExercise({ id: 'y', startTime: '2026-11-03T17:00:00Z', endTime: '2026-11-03T17:30:00Z', category: 'zumba' }, 1, 40)!.type).toBe('other');
  });
  it('daily metrics keep the latest resting HR per day and positive steps', () => {
    const m = mapDaily(
      [{ id: 'a', time: '2026-11-03T06:00:00Z', zoneOffsetSeconds: 0, bpm: 62 }, { id: 'b', time: '2026-11-03T20:00:00Z', zoneOffsetSeconds: 0, bpm: 58 }],
      [{ date: '2026-11-03', steps: 8421 }, { date: '2026-11-04', steps: 0 }],
    );
    expect(m.get('2026-11-03')).toEqual({ restingHr: 58, steps: 8421 });
    expect(m.has('2026-11-04')).toBe(false);
  });
  it('rejects bad timestamps', () => {
    expect(() => localParts('nonsense', 0)).toThrow();
  });
});

describe('native reminder weekday', () => {
  it('maps programme day to Capacitor weekday (1 = Sunday)', () => {
    // 2 Nov 2026 is a Monday
    expect(weekdayForProgrammeDay('2026-11-02', 1)).toBe(2);
    expect(weekdayForProgrammeDay('2026-11-02', 7)).toBe(1);
  });
});
