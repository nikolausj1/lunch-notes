import { LunchDrawing } from "./types";
import { SERIES_BY_NAME, SUBJECT_THEMES, UMBRELLA_TAGS, slugify, themeOf } from "./taxonomy";
import { parseISO } from "./dates";

/**
 * Everything the "By the numbers" page (app/numbers) shows, derived from the
 * archive in one pass. Pure functions over `LunchDrawing[]`: the page is
 * rendered statically, so nothing here runs in the browser.
 *
 * The page is about the content of the drawings (series, subjects, eras,
 * streaks), never about which boy drew what, so nothing here looks at `child`.
 * Every chart colors a drawing by its THEME (`themeOf`): its series, else a
 * big subject such as space or ocean. Only a drawing with no theme is grey.
 */

/* ------------------------------------------------------------ constants */

/** warm grey: a drawing with no theme at all */
export const NO_THEME_COLOR = "#d8d2c6";

/**
 * A drawing with no series that carries one of these is a character, film or
 * game the series pass could not place yet ("characters to place").
 */
export const GAP_TAGS = ["Characters", ...UMBRELLA_TAGS];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

export const num = (n: number) => n.toLocaleString("en-US");

/** "Sept 2019", "Oct 2026" */
export function monthYear(iso: string): string {
  const { y, m } = parseISO(iso);
  return `${MON[m]} ${y}`;
}

/** "fall 2020" for the date a streak began */
export function seasonYear(iso: string): string {
  const { y, m } = parseISO(iso); // m is 0-indexed
  const season = m >= 8 && m <= 10 ? "fall" : m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : "summer";
  return `${season} ${y}`;
}

/** Monday = 0 ... Sunday = 6 (UTC arithmetic, so no time zone surprises) */
function weekdayOf(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function msOf(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m, d);
}

/* --------------------------------------------------------------- themes */

export type ThemeInfo = {
  /** unique across kinds: "series:Kirby", "subject:Ocean" */
  key: string;
  kind: "series" | "subject";
  name: string;
  color: string;
  /** the filter slug: the label links to /?tag=<slug> */
  slug: string;
};

/** a subject theme filters on its first tag ("Astronauts & space" -> astronauts) */
const SUBJECT_SLUG = new Map(SUBJECT_THEMES.map((t) => [t.name, slugify(t.tags[0])]));

const THEME_CACHE = new Map<string, ThemeInfo>();

function themeInfo(d: LunchDrawing): ThemeInfo | null {
  const t = themeOf(d);
  if (!t) return null;
  const key = `${t.kind}:${t.name}`;
  let info = THEME_CACHE.get(key);
  if (!info) {
    const slug = t.kind === "series" ? slugify(t.name) : (SUBJECT_SLUG.get(t.name) ?? slugify(t.name));
    info = { key, kind: t.kind, name: t.name, color: t.color, slug };
    THEME_CACHE.set(key, info);
  }
  return info;
}

/* ------------------------------------------------------------ the shapes */

/** a series or a subject theme with its drawing count */
export type Cell = { name: string; count: number; color: string; slug: string | null };
export type SeriesGroup = { name: string; total: number; cells: Cell[] };

/** every drawing lands in exactly one of these */
export type Partition = {
  total: number;
  /** series groups ("Video games", "Films & shows", ...), biggest first, each with its series */
  groups: SeriesGroup[];
  /** drawings with no series, grouped by subject theme, biggest first */
  subjects: Cell[];
  /** no series, no theme */
  everythingElse: number;
  /** no series, tagged Characters / Movies / Video Games / Pixar / Disney */
  gap: number;
  /** drawings that have a series */
  assigned: number;
  /** drawings with no series that are not waiting for one (subjects + everything else) */
  plain: number;
};

export type GroupBar = { group: string; title: string; total: number; cells: Cell[] };

export type Streak = {
  length: number;
  theme: ThemeInfo;
  start: string;
  end: string;
  /** "fall 2020" */
  season: string;
};

export type CastEntry = {
  name: string;
  count: number;
  /** the series the character belongs to */
  series: string;
  seriesSlug: string;
};

export type CalendarCell = {
  col: number;
  row: number;
  /** a theme's color, NO_THEME_COLOR for a drawing with no theme, null for a school day with no drawing */
  fill: string | null;
};

export type CalendarYear = {
  /** "2019-20" */
  label: string;
  /** week columns this school year spans */
  cols: number;
  cells: CalendarCell[];
  /** the first column of each month that appears (0-indexed month) */
  months: { month: number; col: number }[];
  /** the theme with the most drawings that school year */
  top: { theme: ThemeInfo; count: number } | null;
  drawings: number;
};

export type NumbersStats = {
  total: number;
  seriesCount: number;
  /** distinct weekdays that have at least one drawing */
  schoolDays: number;
  first: string;
  last: string;
  videoGameDrawings: number;
  biggestSeries: Cell | null;
  streak: Streak | null;
  partition: Partition;
  bars: GroupBar[];
  cast: CastEntry[];
  calendar: {
    years: CalendarYear[];
    weekendDrawings: number;
    /** top 10 series by drawings, biggest first */
    legendSeries: ThemeInfo[];
    /** subject themes present, biggest first */
    legendSubjects: ThemeInfo[];
  };
};

/* ---------------------------------------------------------------- cast */

/**
 * The named characters we count in titles: whole-word, case-insensitive
 * (a trailing "s" is allowed, so "Minions" counts for Minion). A title only
 * counts when the drawing's series is the character's own, or when it has no
 * series yet: that keeps Home Alone's Harry out of the Harry Potter count and
 * Cars' Luigi out of the Mario one.
 */
const CAST: { name: string; series: string }[] = [
  { name: "Kirby", series: "Kirby" },
  { name: "Mater", series: "Cars" },
  { name: "Lightning McQueen", series: "Cars" },
  { name: "Snoopy", series: "Snoopy" },
  { name: "Mario", series: "Mario" },
  { name: "Luigi", series: "Mario" },
  { name: "Yoshi", series: "Mario" },
  { name: "Bowser", series: "Mario" },
  { name: "Sonic", series: "Sonic" },
  { name: "Tails", series: "Sonic" },
  { name: "Pikachu", series: "Pokemon" },
  { name: "Yoda", series: "Star Wars" },
  { name: "Grogu", series: "Star Wars" },
  { name: "Harry", series: "Harry Potter" },
  { name: "Hedwig", series: "Harry Potter" },
  { name: "Dobby", series: "Harry Potter" },
  { name: "Percy", series: "Percy Jackson" },
  { name: "Captain Barnacles", series: "Octonauts" },
  { name: "Kwazii", series: "Octonauts" },
  { name: "Peso", series: "Octonauts" },
  { name: "Numberblocks", series: "Numberblocks" },
  { name: "Woody", series: "Toy Story" },
  { name: "Buzz", series: "Toy Story" },
  { name: "Nemo", series: "Finding Nemo & Dory" },
  { name: "Dory", series: "Finding Nemo & Dory" },
  { name: "Bluey", series: "Bluey" },
  { name: "Bingo", series: "Bluey" },
  { name: "Minion", series: "Minions" },
];

function castPattern(name: string): RegExp {
  // "Numberblocks" is matched as the stem, so "Numberblock Five" counts too
  if (name === "Numberblocks") return /numberblock/i;
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
}

function computeCast(drawings: LunchDrawing[], limit = 12): CastEntry[] {
  const rows = CAST.map((c) => ({ ...c, re: castPattern(c.name), count: 0 }));
  for (const d of drawings) {
    const title = d.title ?? "";
    if (!title) continue;
    for (const r of rows) {
      if (d.series && d.series !== r.series) continue;
      if (r.re.test(title)) r.count++;
    }
  }
  return rows
    .map((r, i) => ({ ...r, order: i }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map((r) => ({ name: r.name, count: r.count, series: r.series, seriesSlug: slugify(r.series) }));
}

/* ------------------------------------------------------------- the whole */

const BAR_GROUPS: { match: string; title: string }[] = [
  { match: "Video games", title: "Inside Video games" },
  { match: "Films & shows", title: "Inside Films & shows" },
  { match: "Books", title: "Inside Books" },
];

export function computeStats(drawings: LunchDrawing[]): NumbersStats {
  // one canonical order: by date, then id (ids are stable hashes)
  const ordered = [...drawings].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const total = ordered.length;
  const first = ordered[0]?.date ?? "";
  const last = ordered[total - 1]?.date ?? "";

  /* ---- partition: series, subject themes, everything else, still to place */
  const seriesCount = new Map<string, number>();
  const subjectCount = new Map<string, number>();
  let gap = 0;
  let everythingElse = 0;
  for (const d of ordered) {
    if (d.series) {
      seriesCount.set(d.series, (seriesCount.get(d.series) ?? 0) + 1);
      continue;
    }
    if ((d.tags ?? []).some((t) => GAP_TAGS.includes(t))) {
      gap++;
      continue;
    }
    const t = themeOf(d);
    if (t) subjectCount.set(t.name, (subjectCount.get(t.name) ?? 0) + 1);
    else everythingElse++;
  }

  const byCountThenName = (a: Cell, b: Cell) => b.count - a.count || a.name.localeCompare(b.name);

  const groupMap = new Map<string, Cell[]>();
  for (const [name, count] of seriesCount) {
    const info = SERIES_BY_NAME.get(name);
    const cell: Cell = { name, count, color: info?.color ?? "#b9b2a4", slug: slugify(name) };
    const g = info?.group ?? "Other series";
    groupMap.set(g, [...(groupMap.get(g) ?? []), cell]);
  }
  const groups: SeriesGroup[] = [...groupMap.entries()]
    .map(([name, cells]) => ({
      name,
      cells: cells.sort(byCountThenName),
      total: cells.reduce((s, c) => s + c.count, 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const subjects: Cell[] = SUBJECT_THEMES.filter((t) => (subjectCount.get(t.name) ?? 0) > 0)
    .map((t) => ({ name: t.name, count: subjectCount.get(t.name) ?? 0, color: t.color, slug: SUBJECT_SLUG.get(t.name) ?? null }))
    .sort(byCountThenName);

  const assigned = groups.reduce((s, g) => s + g.total, 0);
  const plain = subjects.reduce((s, c) => s + c.count, 0) + everythingElse;
  const partition: Partition = { total, groups, subjects, everythingElse, gap, assigned, plain };

  const allSeries = groups.flatMap((g) => g.cells).sort(byCountThenName);
  const videoGameDrawings = groups.filter((g) => g.name === "Video games").reduce((s, g) => s + g.total, 0);

  const bars: GroupBar[] = BAR_GROUPS.flatMap(({ match, title }) => {
    const g = groups.find((x) => x.name.startsWith(match));
    return g ? [{ group: g.name, title, total: g.total, cells: g.cells }] : [];
  });

  /* ---- the longest streak: consecutive drawings sharing one theme */
  let streak: Streak | null = null;
  {
    let curKey: string | null = null;
    let curStart = 0;
    let bestLen = 0;
    for (let i = 0; i < ordered.length; i++) {
      const t = themeInfo(ordered[i]);
      const key = t ? t.key : null;
      if (key === null || key !== curKey) {
        curKey = key;
        curStart = i;
      }
      if (t) {
        const len = i - curStart + 1;
        if (len > bestLen) {
          bestLen = len;
          streak = {
            length: len,
            theme: t,
            start: ordered[curStart].date,
            end: ordered[i].date,
            season: seasonYear(ordered[curStart].date),
          };
        }
      }
    }
  }

  /* ---- the calendar: one cell per weekday, colored by that day's theme */
  const dayFill = new Map<string, string>(); // date -> color; the first drawing WITH a theme wins
  const themeTotals = new Map<string, { theme: ThemeInfo; count: number }>();
  const yearThemes = new Map<number, Map<string, { theme: ThemeInfo; count: number }>>();
  const yearDrawings = new Map<number, number>();
  let weekendDrawings = 0;
  const schoolYearOf = (iso: string) => {
    const { y, m } = parseISO(iso);
    return m >= 7 ? y : y - 1; // Aug to Jul
  };
  for (const d of ordered) {
    const t = themeInfo(d);
    const sy = schoolYearOf(d.date);
    yearDrawings.set(sy, (yearDrawings.get(sy) ?? 0) + 1);
    if (weekdayOf(msOf(d.date)) >= 5) weekendDrawings++;
    if (t) {
      const tot = themeTotals.get(t.key) ?? { theme: t, count: 0 };
      tot.count++;
      themeTotals.set(t.key, tot);
      const ym = yearThemes.get(sy) ?? new Map();
      const yt = ym.get(t.key) ?? { theme: t, count: 0 };
      yt.count++;
      ym.set(t.key, yt);
      yearThemes.set(sy, ym);
    }
    const cur = dayFill.get(d.date);
    if (cur === undefined) dayFill.set(d.date, t ? t.color : NO_THEME_COLOR);
    else if (cur === NO_THEME_COLOR && t) dayFill.set(d.date, t.color);
  }

  let schoolDays = 0;
  for (const date of dayFill.keys()) if (weekdayOf(msOf(date)) < 5) schoolDays++;

  const years: CalendarYear[] = [];
  if (total > 0) {
    const firstMs = msOf(first);
    const lastMs = msOf(last);
    for (let sy = schoolYearOf(first); sy <= schoolYearOf(last); sy++) {
      const start = Date.UTC(sy, 7, 1);
      const end = Date.UTC(sy + 1, 6, 31);
      let d0 = start;
      while (weekdayOf(d0) >= 5) d0 += DAY_MS;
      const mon0 = d0 - weekdayOf(d0) * DAY_MS;
      const cells: CalendarCell[] = [];
      const months: { month: number; col: number }[] = [];
      let cols = 0;
      for (let t = start; t <= end; t += DAY_MS) {
        const row = weekdayOf(t);
        // weekends are left out, and so is everything outside the archive's own range
        if (row >= 5 || t < firstMs || t > lastMs) continue;
        const col = Math.floor((t - mon0) / (7 * DAY_MS));
        cells.push({ col, row, fill: dayFill.get(isoOf(t)) ?? null });
        cols = Math.max(cols, col + 1);
        const month = new Date(t).getUTCMonth();
        if (!months.some((m) => m.month === month)) months.push({ month, col });
      }
      const ym = yearThemes.get(sy);
      let top: CalendarYear["top"] = null;
      if (ym) {
        for (const v of ym.values()) {
          if (!top || v.count > top.count || (v.count === top.count && v.theme.name < top.theme.name)) top = v;
        }
      }
      years.push({
        label: `${sy}-${String((sy + 1) % 100).padStart(2, "0")}`,
        cols,
        cells,
        months,
        top,
        drawings: yearDrawings.get(sy) ?? 0,
      });
    }
  }

  const themesByCount = [...themeTotals.values()].sort((a, b) => b.count - a.count || a.theme.name.localeCompare(b.theme.name));
  const legendSeries = themesByCount.filter((t) => t.theme.kind === "series").slice(0, 10).map((t) => t.theme);
  const legendSubjects = themesByCount.filter((t) => t.theme.kind === "subject").map((t) => t.theme);

  return {
    total,
    seriesCount: seriesCount.size,
    schoolDays,
    first,
    last,
    videoGameDrawings,
    biggestSeries: allSeries[0] ?? null,
    streak,
    partition,
    bars,
    cast: computeCast(ordered),
    calendar: { years, weekendDrawings, legendSeries, legendSubjects },
  };
}
