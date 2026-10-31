export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function round(x: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
export function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
