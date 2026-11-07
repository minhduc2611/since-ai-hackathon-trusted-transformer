import { randomBytes } from "node:crypto";

/*
Draw Laplace(0, scale) noise from a cryptographic RNG (noise must not be reproducible by a reader).
shortcut: plain floating-point Laplace (Mironov 2012 attack applies); use a snapping/discrete mechanism before a real deployment.
*/
export function laplace(scale: number): number {
  const u = randomBytes(6).readUIntBE(0, 6) / 2 ** 48 - 0.5; // uniform in [-0.5, 0.5)
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/*
Noisy count with sensitivity 1, rounded and clamped at 0 (post-processing keeps the DP guarantee).
*/
export function noisyCount(trueCount: number, epsilon: number): number {
  return Math.max(0, Math.round(trueCount + laplace(1 / epsilon)));
}

/*
Noisy mean of values clamped to [lo, hi]: noisy sum / noisy count, each with half of epsilon.
*/
export function noisyMean(values: number[], lo: number, hi: number, epsilon: number): number {
  const clamped = values.map((v) => Math.min(hi, Math.max(lo, v)));
  const sum = clamped.reduce((a, b) => a + b, 0) + laplace(Math.max(Math.abs(lo), Math.abs(hi)) / (epsilon / 2));
  const count = clamped.length + laplace(1 / (epsilon / 2));
  if (count < 1) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, sum / count));
}
