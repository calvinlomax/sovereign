import type { Cohort, ResourceStock } from './schema.js';

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
export const populationOf = (cohorts: readonly Cohort[]): number => sum(cohorts.map(c => c.population));
export function weightedMean(cohorts: readonly Cohort[], value: (cohort: Cohort) => number): number {
  const population = populationOf(cohorts);
  return population > 0 ? sum(cohorts.map(c => c.population * value(c))) / population : 0;
}
export const emptyStock = (): ResourceStock => ({ energy: 0, matter: 0, food: 0 });

/** FNV-1a over UTF-16 code units, followed by Mulberry32. No global random state. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keyed streams keep unrelated discoveries and systems from perturbing one another. */
export const randomFor = (seed: string, ...keys: (string | number)[]): (() => number) =>
  seededRandom(JSON.stringify([seed, ...keys]));

export function canonicalJson(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === 'object') return Object.fromEntries(
      Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]),
    );
    return input;
  };
  return JSON.stringify(canonical(value));
}
