import { round } from '../lib/math';

/** BMI = kg / m². Returns 1 dp. */
export function bmi(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) throw new RangeError('Weight and height must be positive');
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/** Waist-to-height ratio = waist / height (same units). Returns 2 dp. */
export function waistToHeight(waistCm: number, heightCm: number): number {
  if (!(waistCm > 0) || !(heightCm > 0)) throw new RangeError('Waist and height must be positive');
  return round(waistCm / heightCm, 2);
}

/** NHS adult BMI bands. Descriptive only – BMI does not account for muscle mass, ethnicity or age. */
export function bmiBand(b: number): string {
  if (b < 18.5) return 'Below 18.5 (underweight range)';
  if (b < 25) return '18.5–24.9 (healthy range)';
  if (b < 30) return '25–29.9 (overweight range)';
  if (b < 40) return '30–39.9 (obese range)';
  return '40 or above (severely obese range)';
}

/** NICE (CG189/NG246) waist-to-height bands. */
export function whtrBand(r: number): string {
  if (r < 0.4) return 'Below 0.4';
  if (r < 0.5) return '0.4–0.49 (healthy central adiposity)';
  if (r < 0.6) return '0.5–0.59 (increased health risk)';
  return '0.6 or above (high health risk)';
}

export function change(baseline: number | undefined | null, current: number | undefined | null): number | null {
  if (baseline == null || current == null) return null;
  return round(current - baseline, 1);
}
