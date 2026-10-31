import { round } from '../lib/math';

/** UK alcohol units = volume (ml) × ABV (%) ÷ 1000. 1 unit = 10 ml (8 g) pure alcohol. */
export function ukUnits(volumeMl: number, abvPercent: number): number {
  if (!(volumeMl >= 0) || !(abvPercent >= 0) || abvPercent > 100) throw new RangeError('Invalid volume or ABV');
  return round((volumeMl * abvPercent) / 1000, 1);
}

export const DRINK_PRESETS = [
  { label: 'Pint of beer/cider', volumeMl: 568, abvPercent: 4.5 },
  { label: 'Half pint', volumeMl: 284, abvPercent: 4.5 },
  { label: 'Bottle of beer (330 ml)', volumeMl: 330, abvPercent: 5 },
  { label: 'Glass of wine (175 ml)', volumeMl: 175, abvPercent: 13 },
  { label: 'Small wine (125 ml)', volumeMl: 125, abvPercent: 13 },
  { label: 'Single spirit (25 ml)', volumeMl: 25, abvPercent: 40 },
] as const;

/** UK CMO low-risk guideline: no more than 14 units a week, spread over 3+ days. */
export const UK_WEEKLY_UNIT_GUIDELINE = 14;
