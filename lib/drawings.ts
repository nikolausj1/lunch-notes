import { LunchDrawing } from "./types";
import data from "./drawings.json";

/**
 * The real archive, produced by the pipeline (pipeline/export.py): every
 * drawing cataloged by the vision pass and curated by Justin. Already
 * sorted oldest -> newest with full dates resolved (written date wins).
 */
const ALL = data as LunchDrawing[];

// Deterministic pseudo-random (no Math.random so layouts are stable across renders)
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Full collection, oldest -> newest. `count` (from ?count=) keeps a recent
 * slice for testing; by default the whole archive ships.
 */
export function getDrawings(count?: number): LunchDrawing[] {
  if (count && count > 0 && count < ALL.length) return ALL.slice(-count);
  return ALL;
}

/** Every tag in the archive with its frequency, most common first. */
export function tagCounts(drawings: LunchDrawing[]): [string, number][] {
  const c = new Map<string, number>();
  for (const d of drawings) {
    for (const t of d.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

export const SITE_TITLE = "Lunch Box Drawings";
