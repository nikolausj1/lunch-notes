import { LunchDrawing } from "./types";

// The 19 real drawings. Child + month/day are transcribed from the notes
// themselves; the year is inferred from the 2025-26 school year.
// note-05 and note-06 have no written label, so their dates are approximate.
const REAL: Omit<LunchDrawing, "imageSrc" | "thumbSrc">[] = [
  { id: "note-01", date: "2025-12-10", child: "Vinny", title: "Snoopy Bundled Up", tags: ["Snoopy", "Winter"] },
  { id: "note-02", date: "2026-02-27", child: "Chase", title: "Erumpent", tags: ["Fantastic Beasts", "Harry Potter"] },
  { id: "note-03", date: "2026-03-02", child: "Vinny", title: "Mooncalf", tags: ["Fantastic Beasts", "Harry Potter"] },
  { id: "note-04", date: "2025-12-13", child: "Vinny", title: "Santa Snoopy's Presents", tags: ["Snoopy", "Christmas"] },
  { id: "note-05", date: "2026-02-24", title: "Curious Creature", tags: ["Creatures"] },
  { id: "note-06", date: "2026-02-25", title: "Demiguise", tags: ["Fantastic Beasts", "Harry Potter"] },
  { id: "note-07", date: "2025-12-15", child: "Vinny", title: "Santa Snoopy on the Move", tags: ["Snoopy", "Christmas"] },
  { id: "note-08", date: "2025-12-16", child: "Vinny", title: "Snoopy Decorates", tags: ["Snoopy", "Christmas"] },
  { id: "note-09", date: "2025-12-16", child: "Chase", title: "Ho Ho Ho, Woodstock", tags: ["Snoopy", "Christmas"] },
  { id: "note-10", date: "2025-12-17", child: "Vinny", title: "Santa Minions", tags: ["Minions", "Christmas"] },
  { id: "note-11", date: "2025-12-17", child: "Chase", title: "Cozy Minions", tags: ["Minions", "Christmas"] },
  { id: "note-12", date: "2026-03-11", child: "Chase", title: "Chief Bogo", tags: ["Zootopia"] },
  { id: "note-13", date: "2025-11-30", child: "Chase", title: "Donut in Orbit", tags: ["Space", "Donuts"] },
  { id: "note-14", date: "2025-12-02", child: "Chase", title: "One Small Bite", tags: ["Space", "Donuts"] },
  { id: "note-15", date: "2025-12-03", child: "Chase", title: "Donut Throne", tags: ["Space", "Donuts"] },
  { id: "note-16", date: "2025-12-07", child: "Chase", title: "Star Balloons", tags: ["Space"] },
  { id: "note-17", date: "2025-12-08", child: "Chase", title: "Catching a Star", tags: ["Space"] },
  { id: "note-18", date: "2026-01-06", child: "Chase", title: "Alexa, Take Me to the Moon", tags: ["Space"] },
  { id: "note-19", date: "2026-01-07", child: "Chase", title: "Over the Moon", tags: ["Space"] },
];

function withImages(d: Omit<LunchDrawing, "imageSrc" | "thumbSrc">): LunchDrawing {
  const file = d.id.replace(/-v\d+$/, "");
  return { ...d, imageSrc: `/notes/${file}.jpg`, thumbSrc: `/thumbs/${file}.jpg` };
}

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
 * Duplicate the real drawings to simulate a larger archive (per PRD §5).
 * Sample copies get plausible weekday dates spread across the school year
 * and keep the source drawing's child/tags. Delete this once the real
 * archive has enough drawings.
 */
function makeSamples(count: number): LunchDrawing[] {
  const samples: LunchDrawing[] = [];
  const start = new Date("2025-09-08T12:00:00Z").getTime();
  const end = new Date("2026-06-12T12:00:00Z").getTime();
  const day = 86400000;
  for (let i = 0; i < count; i++) {
    const src = REAL[i % REAL.length];
    const r = hash(`${src.id}-v${i}`);
    let t = start + Math.floor((r * (end - start)) / day) * day;
    const dow = new Date(t).getUTCDay();
    if (dow === 0) t += day; // shift weekends to weekdays
    if (dow === 6) t += 2 * day;
    samples.push(
      withImages({
        ...src,
        id: `${src.id}-v${i}`,
        date: new Date(t).toISOString().slice(0, 10),
        sample: true,
      })
    );
  }
  return samples;
}

/** Full collection, sorted oldest -> newest. */
export function getDrawings(total = 120): LunchDrawing[] {
  const real = REAL.map(withImages);
  const all = [...real, ...makeSamples(Math.max(0, total - real.length))];
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
}

export const SITE_TITLE = "Lunch Notes";
