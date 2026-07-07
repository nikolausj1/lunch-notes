export type LunchDrawing = {
  id: string;
  imageSrc: string;
  thumbSrc: string;
  date: string; // ISO date, e.g. "2026-07-07"
  title?: string;
  child?: string;
  tags?: string[];
  description?: string;
  /** True for programmatically duplicated sample entries (remove when real archive grows) */
  sample?: boolean;
};

export type ViewMode = "scatter" | "grid" | "stack" | "timeline";

export const MODES: ViewMode[] = ["scatter", "grid", "stack", "timeline"];
