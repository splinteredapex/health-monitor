import { bmi, waistToHeight, bmiBand, whtrBand, change } from './body';
import { ukUnits } from './alcohol';
import { resolveSleep, summariseSleep } from './sleep';
import { exerciseTotals } from './exercise';
import { addDays, diffDays, formatDateUK, isLocalDate, parseUKDate, ageOn, localDateTimeToDate, toLocalDate, dateRange } from '../lib/dates';
import { ex, sleepRec } from '../test/factories';
import { csvCell, toCsv, parseCsv } from './csv';

describe('body calculations', () => {
  it('BMI uses kg / m²', () => {
    expect(bmi(86, 185.4)).toBe(25.0);
    expect(bmi(70, 175)).toBe(22.9);
  });
  it('waist-to-height ratio', () => {
    expect(waistToHeight(92, 185.4)).toBe(0.5);
    expect(waistToHeight(80, 160)).toBe(0.5);
  });
  it('rejects non-positive input', () => {
    expect(() => bmi(0, 180)).toThrow();
    expect(() => waistToHeight(90, 0)).toThrow();
  });
  it('bands and change', () => {
    expect(bmiBand(24.99)).toMatch(/healthy/);
    expect(bmiBand(25)).toMatch(/overweight/);
    expect(whtrBand(0.49)).toMatch(/healthy/);
    expect(whtrBand(0.5)).toMatch(/increased/);
    expect(change(86, 84.3)).toBe(-1.7);
    expect(change(undefined, 84)).toBeNull();
  });
});

describe('UK alcohol units', () => {
  it('volume × ABV ÷ 1000', () => {
    expect(ukUnits(568, 4)).toBe(2.3);
    expect(ukUnits(175, 12)).toBe(2.1);
    expect(ukUnits(25, 40)).toBe(1);
    expect(ukUnits(750, 13.5)).toBe(10.1);
    expect(ukUnits(330, 0)).toBe(0);
  });
  it('rejects invalid', () => {
    expect(() => ukUnits(-1, 5)).toThrow();
    expect(() => ukUnits(100, 101)).toThrow();
  });
});

describe('dates', () => {
  it('validates and formats', () => {
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(formatDateUK('2026-10-31')).toBe('31/10/2026');
    expect(parseUKDate('1/2/2026')).toBe('2026-02-01');
    expect(parseUKDate('31/02/2026')).toBeNull();
  });
  it('calendar arithmetic is DST-safe', () => {
    // UK clocks go back 25 Oct 2026 and forward 29 Mar 2026
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(dateRange('2026-10-24', '2026-10-27')).toHaveLength(4);
  });
  it('local date of instants around midnight', () => {
    expect(toLocalDate(localDateTimeToDate('2026-10-31', '23:59'))).toBe('2026-10-31');
    expect(toLocalDate(localDateTimeToDate('2026-11-01', '00:00'))).toBe('2026-11-01');
    // 23:30 UTC on 30 June is 00:30 BST on 1 July
    expect(toLocalDate(new Date(Date.UTC(2026, 5, 30, 23, 30)))).toBe('2026-07-01');
  });
  it('age', () => {
    expect(ageOn('1987-11-01', '2026-10-31')).toBe(38);
    expect(ageOn('1987-10-31', '2026-10-31')).toBe(39);
  });
});

describe('overnight sleep', () => {
  it('bedtime before midnight belongs to the previous day', () => {
    const s = resolveSleep('2026-11-02', '23:15', '06:45');
    expect(s.bedLocal).toBe('2026-11-01T23:15');
    expect(s.durationMin).toBe(450);
  });
  it('bedtime after midnight is the same day', () => {
    expect(resolveSleep('2026-11-02', '00:30', '07:00').durationMin).toBe(390);
  });
  it('autumn DST night is one hour longer of real sleep', () => {
    // 25 Oct 2026 01:00–02:00 happens twice
    expect(resolveSleep('2026-10-25', '23:00', '07:00').durationMin).toBe(9 * 60);
  });
  it('spring DST night is one hour shorter', () => {
    expect(resolveSleep('2026-03-29', '23:00', '07:00').durationMin).toBe(7 * 60);
  });
  it('rejects equal times', () => {
    expect(() => resolveSleep('2026-11-02', '07:00', '07:00')).toThrow();
  });
  it('summary does not infer quality from duration', () => {
    const s = summariseSleep([sleepRec('2026-11-01', 480), sleepRec('2026-11-02', 360, 4)], 7, 9);
    expect(s.avgDurationMin).toBe(420);
    expect(s.avgQuality).toBe(4);
    expect(s.nightsInTarget).toBe(1);
    expect(summariseSleep([], 7, 9).avgDurationMin).toBeNull();
  });
});

describe('exercise totals', () => {
  it('separates intensity and excludes strength from aerobic', () => {
    const t = exerciseTotals([
      ex('2026-11-01', 'walking', 30, 'easy'),
      ex('2026-11-02', 'cycling', 40, 'moderate'),
      ex('2026-11-03', 'running', 20, 'hard', false),
      ex('2026-11-04', 'strength', 30, 'moderate'),
      ex('2026-11-05', 'mobility', 10, 'easy'),
    ]);
    expect(t.aerobicMinutes).toBe(90);
    expect(t.easyAerobicMinutes).toBe(30);
    expect(t.moderateMinutes).toBe(40);
    expect(t.vigorousMinutes).toBe(20);
    expect(t.moderateEquivalentMinutes).toBe(80);
    expect(t.strengthSessions).toBe(1);
    expect(t.totalMinutes).toBe(130);
    expect(t.unplannedSessions).toBe(1);
  });
  it('empty week', () => {
    expect(exerciseTotals([]).aerobicMinutes).toBe(0);
  });
});

describe('CSV', () => {
  it('escapes and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
  });
  it('round-trips', () => {
    const text = toCsv([{ a: 'x,y', b: 2 }], [['A', (r) => r.a], ['B', (r) => r.b]]);
    expect(parseCsv(text)).toEqual([['A', 'B'], ['x,y', '2']]);
  });
});
