import { LunchDrawing } from "./types";

/**
 * The vocabulary behind the subject picker and the stats page.
 *
 * Two kinds of label live on a drawing: `tags` (subjects, occasions and a few
 * umbrella tags from the vision pass) and an optional `series` (a franchise,
 * show, game or book, derived in pipeline/derive_series.py and reviewed in
 * curated.json). A filter slug matches either, so "cars" finds the Cars tag
 * and the Cars series alike.
 */

export type SeriesInfo = {
  name: string;
  group: string; // "Video games" | "Films & shows" | "Books" | "Toys & originals" | …
  medium: string; // game | film | show | book | toy/other
  parent: string | null; // Pixar, Nintendo, …
  color: string; // stats-page color
};

/** every series the derivation knows, biggest first (generated from the pipeline vocabulary) */
export const SERIES: SeriesInfo[] = [
  { name: "Kirby", group: "Video games", medium: "game", parent: "Nintendo", color: "#e38bb2" },
  { name: "Cars", group: "Films & shows", medium: "film", parent: "Pixar", color: "#c9463c" },
  { name: "Octonauts", group: "Films & shows", medium: "show", parent: null, color: "#3f8fb5" },
  { name: "Harry Potter", group: "Books & myths", medium: "book", parent: "Wizarding World", color: "#9a6a2a" },
  { name: "Mario", group: "Video games", medium: "game", parent: "Nintendo", color: "#e0862c" },
  { name: "Sonic", group: "Video games", medium: "game", parent: "Sega", color: "#2f56b8" },
  { name: "Snoopy", group: "Films & shows", medium: "show", parent: "Peanuts", color: "#6b665c" },
  { name: "Wild Kratts", group: "Films & shows", medium: "show", parent: null, color: "#6a9c3a" },
  { name: "Finding Nemo & Dory", group: "Films & shows", medium: "film", parent: "Pixar", color: "#f0b43c" },
  { name: "Star Wars", group: "Films & shows", medium: "film", parent: "Lucasfilm", color: "#3f3a31" },
  { name: "Percy Jackson", group: "Books & myths", medium: "book", parent: "Rick Riordan", color: "#2e8a8a" },
  { name: "Numberblocks", group: "Films & shows", medium: "show", parent: null, color: "#8a5fb3" },
  { name: "Ninja Duck", group: "Toys & originals", medium: "toy/other", parent: null, color: "#b4607a" },
  { name: "Bluey", group: "Films & shows", medium: "show", parent: null, color: "#4f8f6f" },
  { name: "Minions", group: "Films & shows", medium: "film", parent: "Illumination", color: "#c0783a" },
  { name: "Dog Man", group: "Books & myths", medium: "book", parent: "Dav Pilkey", color: "#5b7fa6" },
  { name: "Planes", group: "Films & shows", medium: "film", parent: "Disney", color: "#9c8a3c" },
  { name: "Ghostbusters", group: "Films & shows", medium: "film", parent: null, color: "#8c5e4e" },
  { name: "Frozen", group: "Films & shows", medium: "film", parent: "Disney", color: "#6e7fb0" },
  { name: "How to Train Your Dragon", group: "Films & shows", medium: "film", parent: "DreamWorks", color: "#a3703f" },
  { name: "Minecraft", group: "Video games", medium: "game", parent: "Mojang", color: "#5f9b9b" },
  { name: "Ninjago", group: "Films & shows", medium: "show", parent: "Lego", color: "#b07a9a" },
  { name: "Zootopia", group: "Films & shows", medium: "film", parent: "Disney", color: "#7f8c5a" },
  { name: "Fantastic Beasts", group: "Films & shows", medium: "film", parent: "Wizarding World", color: "#a65f5f" },
  { name: "The Lion King", group: "Films & shows", medium: "film", parent: "Disney", color: "#b4607a" },
  { name: "Home Alone", group: "Films & shows", medium: "film", parent: null, color: "#4f8f6f" },
  { name: "Pokemon", group: "Video games", medium: "game", parent: "Nintendo", color: "#c0783a" },
  { name: "Among Us", group: "Video games", medium: "game", parent: "Innersloth", color: "#5b7fa6" },
  { name: "BattleBots", group: "Films & shows", medium: "show", parent: null, color: "#9c8a3c" },
  { name: "Totoro", group: "Films & shows", medium: "film", parent: "Studio Ghibli", color: "#8c5e4e" },
  { name: "Toy Story", group: "Films & shows", medium: "film", parent: "Pixar", color: "#6e7fb0" },
  { name: "Garfield", group: "Films & shows", medium: "film", parent: null, color: "#a3703f" },
  { name: "The Grinch", group: "Films & shows", medium: "film", parent: "Dr. Seuss", color: "#5f9b9b" },
  { name: "Surf's Up", group: "Films & shows", medium: "film", parent: "Sony Pictures Animation", color: "#b07a9a" },
  { name: "Paw Patrol", group: "Films & shows", medium: "show", parent: null, color: "#7f8c5a" },
  { name: "DC League of Super-Pets", group: "Films & shows", medium: "film", parent: "DC", color: "#a65f5f" },
  { name: "Wreck-It Ralph", group: "Films & shows", medium: "film", parent: "Disney", color: "#b4607a" },
  { name: "The Mitchells vs. the Machines", group: "Films & shows", medium: "film", parent: "Sony Pictures Animation", color: "#4f8f6f" },
  { name: "Captain Underpants", group: "Books & myths", medium: "book", parent: "Dav Pilkey", color: "#c0783a" },
  { name: "Kung Fu Panda", group: "Films & shows", medium: "film", parent: "DreamWorks", color: "#5b7fa6" },
  { name: "Paddington", group: "Films & shows", medium: "film", parent: null, color: "#9c8a3c" },
  { name: "The Wild Robot", group: "Films & shows", medium: "film", parent: "DreamWorks", color: "#8c5e4e" },
  { name: "Home (DreamWorks)", group: "Films & shows", medium: "film", parent: "DreamWorks", color: "#6e7fb0" },
  { name: "Ratatouille", group: "Films & shows", medium: "film", parent: "Pixar", color: "#a3703f" },
  { name: "Spies in Disguise", group: "Films & shows", medium: "film", parent: null, color: "#5f9b9b" },
  { name: "Elf", group: "Films & shows", medium: "film", parent: null, color: "#b07a9a" },
];

export const SERIES_BY_NAME = new Map(SERIES.map((s) => [s.name, s]));

/** subject tags, biggest first; "Characters" is an umbrella and stays hidden */
export const SUBJECT_TAGS = ["Animals", "Space", "Ocean", "Astronauts", "Vehicles", "Creatures", "Cats", "Dogs", "Birds", "Sports", "Food", "Monsters", "Dragons", "Nature", "Robots", "Capybara", "Dessert", "Sharks", "Aliens", "Dinosaurs", "Objects", "Fantasy", "Gadgets", "Magic", "Medieval", "Music", "Machines", "Mythology", "Treasure", "Weapons"];

/** occasion tags */
export const OCCASION_TAGS = ["Halloween", "Christmas", "Winter", "Birthday", "St Patricks Day", "Thanksgiving", "Valentines", "St. Patrick's Day", "St. Patricks"];

/** umbrella / parent tags that still make useful filters ("everything from Pixar") */
export const UMBRELLA_TAGS = ["Video Games", "Movies", "Pixar", "Disney"];

/** franchise tags that the series field now covers (kept on the data, hidden from the picker) */
export const RETIRED_TAGS = ["Kirby", "Cars", "Harry Potter", "Mario", "Snoopy", "Sonic", "Star Wars", "Bluey", "Minions", "Fantastic Beasts", "Pokemon", "Zootopia", "Paw Patrol"];

export const HIDDEN_TAGS = ["Characters", ...RETIRED_TAGS];

/** url/slug form: "Finding Nemo & Dory" -> "finding-nemo-dory" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Filter = { tag: string | null; child: "Chase" | "Vinny" | null };
export const EMPTY_FILTER: Filter = { tag: null, child: null };

/** does the drawing carry the label behind `slug` (a tag or a series)? */
export function hasLabel(d: LunchDrawing, slug: string): boolean {
  if (d.series && slugify(d.series) === slug) return true;
  return (d.tags ?? []).some((t) => slugify(t) === slug);
}

export function matchesFilter(d: LunchDrawing, f: Filter): boolean {
  if (f.child && d.child !== f.child) return false;
  if (f.tag && !hasLabel(d, f.tag)) return false;
  return true;
}

export function applyFilter(all: LunchDrawing[], f: Filter): LunchDrawing[] {
  if (!f.tag && !f.child) return all;
  return all.filter((d) => matchesFilter(d, f));
}

/** the display name behind a slug, looked up across tags and series */
export function labelForSlug(all: LunchDrawing[], slug: string): string | null {
  for (const s of SERIES) if (slugify(s.name) === slug) return s.name;
  for (const d of all) {
    for (const t of d.tags ?? []) if (slugify(t) === slug) return t;
    if (d.series && slugify(d.series) === slug) return d.series;
  }
  return null;
}

export type PickerGroup = { title: string; items: { name: string; slug: string; count: number }[] };

/**
 * The picker's three groups with live counts for the given set (already
 * narrowed by child when one is chosen). Labels under `min` uses are dropped.
 */
export function pickerGroups(set: LunchDrawing[], min = 5): PickerGroup[] {
  const tagCount = new Map<string, number>();
  const seriesCount = new Map<string, number>();
  for (const d of set) {
    for (const t of d.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    if (d.series) seriesCount.set(d.series, (seriesCount.get(d.series) ?? 0) + 1);
  }
  const item = (name: string, count: number) => ({ name, slug: slugify(name), count });
  const subjects = SUBJECT_TAGS.map((t) => item(t, tagCount.get(t) ?? 0));
  const extraSubjects = [...tagCount.keys()]
    .filter(
      (t) =>
        !SUBJECT_TAGS.includes(t) &&
        !OCCASION_TAGS.includes(t) &&
        !UMBRELLA_TAGS.includes(t) &&
        !HIDDEN_TAGS.includes(t)
    )
    .map((t) => item(t, tagCount.get(t) ?? 0));
  const series = [...seriesCount.entries()].map(([n, c]) => item(n, c));
  const umbrellas = UMBRELLA_TAGS.map((t) => item(t, tagCount.get(t) ?? 0));
  const occasions = OCCASION_TAGS.map((t) => item(t, tagCount.get(t) ?? 0));
  const keep = (xs: { name: string; slug: string; count: number }[]) =>
    xs.filter((x) => x.count >= min).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return [
    { title: "Subjects", items: keep([...subjects, ...extraSubjects]) },
    { title: "Series", items: keep([...series, ...umbrellas]) },
    { title: "Occasions", items: keep(occasions) },
  ].filter((g) => g.items.length > 0);
}

/* ---------- themes: what a drawing is "about", for the stats page ---------- */

export type Theme = { kind: "series" | "subject"; name: string; color: string };

/** big subjects that count as themes when a drawing has no series (priority order) */
export const SUBJECT_THEMES: { name: string; tags: string[]; color: string }[] = [
  { name: "Astronauts & space", tags: ["Astronauts", "Space", "Aliens"], color: "#5a6b8c" },
  { name: "Ocean", tags: ["Ocean", "Sharks"], color: "#6f9bb3" },
  { name: "Capybara", tags: ["Capybara"], color: "#b08a5a" },
  { name: "Dinosaurs", tags: ["Dinosaurs"], color: "#7f8f5a" },
  { name: "Creatures", tags: ["Creatures", "Dragons", "Monsters"], color: "#8c6f8c" },
  { name: "Cats", tags: ["Cats"], color: "#b59a6a" },
  { name: "Dogs", tags: ["Dogs"], color: "#a07a5a" },
  { name: "Birds", tags: ["Birds"], color: "#7aa0a0" },
  { name: "Animals", tags: ["Animals"], color: "#9c9a7a" },
  { name: "Vehicles", tags: ["Vehicles"], color: "#8a8f96" },
  { name: "Food", tags: ["Food", "Dessert"], color: "#c7a04a" },
  { name: "Sports", tags: ["Sports"], color: "#7a9c6a" },
  { name: "Robots", tags: ["Robots"], color: "#8c8c9c" },
  { name: "Nature", tags: ["Nature"], color: "#8aa37a" },
  { name: "Holidays", tags: ["Halloween", "Christmas", "Winter", "Birthday", "St Patricks Day", "Thanksgiving", "Valentines", "St. Patrick's Day", "St. Patricks"], color: "#b57a7a" },
];

export function themeOf(d: LunchDrawing): Theme | null {
  if (d.series) {
    const s = SERIES_BY_NAME.get(d.series);
    return { kind: "series", name: d.series, color: s?.color ?? "#b9b2a4" };
  }
  const tags = d.tags ?? [];
  for (const t of SUBJECT_THEMES) {
    if (t.tags.some((x) => tags.includes(x))) return { kind: "subject", name: t.name, color: t.color };
  }
  return null;
}
