import { NO_THEME_COLOR, type Cell, type Partition } from "@/lib/stats";
import { textWidth, wrapWords } from "./textMetrics";

/**
 * Geometry for the stats charts: a squarified treemap (Bruls, Huizing, van
 * Wijk), stacked-bar segments, and the label rules. Everything here is plain
 * numbers so the chart components only have to draw what they are handed.
 */

const INK = "#3f3a31";
export const PAPER = "#fbf8ee";

export type Rect = { x: number; y: number; w: number; h: number };

/* ---------------------------------------------------------------- color */

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** which label color reads better on this fill: white or ink */
export function inkOn(fill: string): "w" | "i" {
  return contrast("#ffffff", fill) >= contrast(INK, fill) ? "w" : "i";
}

/* ------------------------------------------------------------- squarify */

/**
 * Squarified treemap. `items` should be biggest first; returns one rectangle
 * per item (zero-sized items are dropped) tiling x, y, w, h.
 */
export function squarify<K>(
  items: { key: K; value: number }[],
  x: number,
  y: number,
  w: number,
  h: number
): (Rect & { key: K })[] {
  const live = items.filter((i) => i.value > 0);
  const total = live.reduce((s, i) => s + i.value, 0);
  if (!live.length || total <= 0 || w <= 0 || h <= 0) return [];
  const areas = live.map((i) => ({ key: i.key, area: (i.value / total) * w * h }));
  const out: (Rect & { key: K })[] = [];

  const worst = (row: { area: number }[], side: number) => {
    const s = row.reduce((t, r) => t + r.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }
    const s = row.reduce((t, r) => t + r.area, 0);
    if (w >= h) {
      // a column along the left edge
      const cw = s / h;
      let yy = y;
      for (const r of row) {
        out.push({ key: r.key, x, y: yy, w: cw, h: r.area / cw });
        yy += r.area / cw;
      }
      x += cw;
      w -= cw;
    } else {
      // a row along the top edge
      const rh = s / w;
      let xx = x;
      for (const r of row) {
        out.push({ key: r.key, x: xx, y, w: r.area / rh, h: rh });
        xx += r.area / rh;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/* --------------------------------------------------------------- labels */

export type LabelPlan = {
  /** the name, one line or wrapped (x, y is the vertical middle of the text) */
  lines: { text: string; x: number; y: number }[];
  /** the count: inline = on the first line right after the name */
  count: { text: string; x: number; y: number; inline: boolean } | null;
};

const LABEL_MIN_W = 54;
const LABEL_MIN_H = 22;

/**
 * Label for a cell: "name count" on one line, else the name (wrapped if need
 * be) with the count underneath when there is room. Null when the cell is
 * smaller than 54 x 22 or the name will not fit.
 */
export function planCellLabel(rect: Rect, name: string, count: number): LabelPlan | null {
  const { x, y, w, h } = rect;
  if (w < LABEL_MIN_W || h < LABEL_MIN_H) return null;
  const px = 5;
  const text = String(count);
  const nw = textWidth(name, 11, 700);
  const cw = textWidth(text, 9.5, 600);
  if (nw + 5 + cw + 2 * px <= w) {
    return {
      lines: [{ text: name, x: x + px, y: y + 12 }],
      count: { text, x: x + px + nw + 5, y: y + 12, inline: true },
    };
  }
  const lines = wrapWords(name, w - 2 * px, 11, 700);
  if (!lines || h < 8 + 13 * lines.length) return null;
  return {
    lines: lines.map((t, i) => ({ text: t, x: x + px, y: y + 12 + 13 * i })),
    count:
      h >= 8 + 13 * (lines.length + 1)
        ? { text, x: x + px, y: y + 12 + 13 * lines.length, inline: false }
        : null,
  };
}

/* -------------------------------------------------------------- treemap */

export type TreemapCell = {
  key: string;
  kind: "series" | "subject" | "else";
  name: string;
  count: number;
  color: string;
  /** /?tag=<slug>; null for "Everything else" */
  slug: string | null;
  /** series group, for the tooltip */
  group: string | null;
  rect: Rect;
  on: "w" | "i";
  label: LabelPlan | null;
  /** a one-series group too small for its own header: the group's name above the series name */
  groupTag: { text: string; x: number; y: number } | null;
};

export type TreemapGroup = {
  name: string;
  total: number;
  /** where the header text sits (middle of its line); null when the group is too small */
  header: { x: number; y: number } | null;
};

export type TreemapGeo = {
  w: number;
  h: number;
  groups: TreemapGroup[];
  cells: TreemapCell[];
  gap: { rect: Rect; pill: { text: string; x: number; y: number; w: number } | null };
};

const GUTTER = 2;
const CELL_INSET = 0.75;
const HEADER_H = 18;

const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, w: Math.max(r.w - 2 * by, 0), h: Math.max(r.h - 2 * by, 0) });

export function layoutTreemap(p: Partition, W: number, H: number): TreemapGeo {
  const groups: TreemapGroup[] = [];
  const cells: TreemapCell[] = [];
  let gap: TreemapGeo["gap"] = { rect: { x: 0, y: 0, w: 0, h: 0 }, pill: null };

  // first split: the series against everything else; "everything else" is then
  // cut into the plain subjects and, underneath, a full-width strip for the
  // characters still to place (so the strip can always carry its label)
  const rest = p.plain + p.gap;
  const blocks = squarify(
    [
      { key: "series", value: p.assigned },
      { key: "rest", value: rest },
    ].sort((a, b) => b.value - a.value),
    0,
    0,
    W,
    H
  );

  for (const block of blocks) {
    if (block.key === "series") {
      for (const g of squarify(p.groups.map((x) => ({ key: x.name, value: x.total })), block.x, block.y, block.w, block.h)) {
        const group = p.groups.find((x) => x.name === g.key)!;
        const r = inset(g, GUTTER / 2);
        const hasHeader = r.w >= 70 && r.h >= 60;
        groups.push({ name: group.name, total: group.total, header: hasHeader ? { x: r.x + 1, y: r.y + 9 } : null });
        const head = hasHeader ? HEADER_H : 0;
        const inner = squarify(group.cells.map((c) => ({ key: c.name, value: c.count })), r.x, r.y + head, r.w, r.h - head);
        for (const s of inner) {
          const cell = group.cells.find((c) => c.name === s.key)!;
          const on = inkOn(cell.color);
          let label = planCellLabel(s, cell.name, cell.count);
          let groupTag: TreemapCell["groupTag"] = null;
          // a one-series group with no header: name the group above the series
          if (
            !hasHeader &&
            group.cells.length === 1 &&
            s.h >= 23 &&
            s.w >= Math.max(textWidth(group.name, 9.5, 600), textWidth(cell.name, 11, 700) + 5 + textWidth(String(cell.count), 9.5, 600)) + 10
          ) {
            // keep the underline of the series name inside a short cell
            const nameY = Math.min(18.5, s.h - 8);
            groupTag = { text: group.name, x: s.x + 5, y: s.y + Math.min(7.5, nameY - 10) };
            label = {
              lines: [{ text: cell.name, x: s.x + 5, y: s.y + nameY }],
              count: { text: String(cell.count), x: s.x + 5 + textWidth(cell.name, 11, 700) + 5, y: s.y + nameY, inline: true },
            };
          }
          cells.push({
            key: `series:${cell.name}`,
            kind: "series",
            name: cell.name,
            count: cell.count,
            color: cell.color,
            slug: cell.slug,
            group: group.name,
            rect: inset(s, CELL_INSET),
            on,
            label,
            groupTag,
          });
        }
      }
    } else {
      const gapH = rest > 0 ? block.h * (p.gap / rest) : 0;
      const plainBlock: Rect = { x: block.x, y: block.y, w: block.w, h: block.h - gapH };
      const gapBlock: Rect = { x: block.x, y: block.y + block.h - gapH, w: block.w, h: gapH };

      const items: { key: string; value: number }[] = [
        ...p.subjects.map((c) => ({ key: c.name, value: c.count })),
        { key: "Everything else", value: p.everythingElse },
      ].sort((a, b) => b.value - a.value);
      for (const s of squarify(items, plainBlock.x, plainBlock.y, plainBlock.w, plainBlock.h)) {
        const subject = p.subjects.find((c) => c.name === s.key);
        const isElse = !subject;
        const color = subject ? subject.color : NO_THEME_COLOR;
        const count = subject ? subject.count : p.everythingElse;
        cells.push({
          key: `subject:${s.key}`,
          kind: isElse ? "else" : "subject",
          name: s.key,
          count,
          color,
          slug: subject ? subject.slug : null,
          group: null,
          rect: inset(s, CELL_INSET),
          on: isElse ? "i" : inkOn(color),
          label: planCellLabel(inset(s, GUTTER / 2), s.key, count),
          groupTag: null,
        });
      }

      const r = inset(gapBlock, GUTTER / 2);
      const full = `Characters to place (${p.gap})`;
      const short = `To place (${p.gap})`;
      let text = full;
      let pw = textWidth(full, 11, 700) + 14;
      if (pw > r.w - 10) {
        text = short;
        pw = textWidth(short, 11, 700) + 14;
      }
      gap = {
        rect: r,
        pill: pw <= r.w - 10 && r.h >= 31 ? { text, x: r.x + 6, y: r.y + 6, w: pw } : null,
      };
    }
  }
  return { w: W, h: H, groups, cells, gap };
}

/* ------------------------------------------------------------ group bars */

export type BarSegment = {
  cell: Cell;
  x: number;
  w: number;
  /** drawn inside the segment when it is at least 6% of the group and the text fits */
  inline: boolean;
};

export function layoutBar(cells: Cell[], total: number, W: number): { segments: BarSegment[]; rest: Cell[] } {
  const segments: BarSegment[] = [];
  const rest: Cell[] = [];
  let x = 0;
  for (const cell of cells) {
    const w = (cell.count / total) * W;
    const need = textWidth(cell.name, 11, 700) + 5 + textWidth(String(cell.count), 9.5, 600) + 12;
    const inline = cell.count / total >= 0.06 && need <= w;
    segments.push({ cell, x, w, inline });
    if (!inline) rest.push(cell);
    x += w;
  }
  return { segments, rest };
}
