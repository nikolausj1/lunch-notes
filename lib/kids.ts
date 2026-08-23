import { parseISO } from "./dates";

/**
 * The boys. Kindergarten fall years are the anchors Justin confirmed
 * (Chase: 3rd grade in 2025-26, Vinny: K in 2025-26); grades derive from
 * them rather than from birthday cutoffs.
 */
export const KIDS: Record<string, { birthday: string; kFall: number }> = {
  Chase: { birthday: "2017-02-11", kFall: 2022 },
  Vinny: { birthday: "2019-07-18", kFall: 2025 },
};

/** Whole years old on `date`. */
export function ageOn(child: string, date: string): number | null {
  const kid = KIDS[child];
  if (!kid) return null;
  const b = parseISO(kid.birthday);
  const d = parseISO(date);
  let age = d.y - b.y;
  if (d.m < b.m || (d.m === b.m && d.d < b.d)) age--;
  return age >= 0 ? age : null;
}

const ORDINALS = ["K", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** "K", "1st", … for the school year containing `date`; null before K. */
export function gradeOn(child: string, date: string): string | null {
  const kid = KIDS[child];
  if (!kid) return null;
  const d = parseISO(date);
  const schoolYearStart = d.m >= 7 ? d.y : d.y - 1; // Aug–Jul school years
  const g = schoolYearStart - kid.kFall;
  if (g < 0 || g >= ORDINALS.length) return null;
  return ORDINALS[g] + (g > 0 ? " grade" : "");
}

/** "6 · 1st grade" or "4" (preschool era) — for metadata labels. */
export function ageGradeLabel(child: string | undefined, date: string): string | null {
  if (!child) return null;
  const age = ageOn(child, date);
  if (age == null) return null;
  const grade = gradeOn(child, date);
  return grade ? `${age} · ${grade}` : `${age}`;
}
