export type LunchDrawing = {
  id: string;
  imageSrc: string;
  thumbSrc: string;
  date: string; // ISO date, e.g. "2026-07-07"
  /** how the date was derived: "written" (on the note), "photo", "estimated", "manual" */
  dateSource?: string;
  title?: string;
  child?: string;
  tags?: string[];
  /** franchise / show / game / book the drawing belongs to (pipeline/derive_series.py + curated.json) */
  series?: string;
  description?: string;
};

export type ViewMode = "scatter" | "grid" | "stack" | "timeline" | "wall";

export const MODES: ViewMode[] = ["grid", "wall", "stack", "timeline", "scatter"];
