import { LunchDrawing, ViewMode } from "./types";
import { hash } from "./drawings";

export type NoteTarget = {
  x: number; // center position, px in viewport space
  y: number;
  r: number; // rotation deg
  s: number; // scale (1 = base note size)
  z: number; // z-index
  hidden?: boolean; // fully skip rendering (deep stack layers)
};

export type Viewport = { w: number; h: number };

/** Base square note size for a viewport (all modes scale relative to this) */
export function baseNoteSize(vp: Viewport): number {
  return Math.max(96, Math.min(150, Math.min(vp.w, vp.h) * 0.14));
}

// ---------------------------------------------------------------- scatter

export type ScatterInfo = { height: number };

/**
 * The scatter desk is a virtual table that can be taller than the viewport —
 * the user scrolls down the table to reach the rest of the collection.
 * Density stays comfortable regardless of note count.
 */
export function scatterTargets(
  drawings: LunchDrawing[],
  vp: Viewport
): { targets: NoteTarget[]; info: ScatterInfo } {
  const size = baseNoteSize(vp);
  const margin = size * 0.62;
  const topSafe = 96; // keep the mode selector breathable
  const w = vp.w - margin * 2;
  const n = drawings.length;

  // Organic distribution: jittered poisson-ish placement on a shuffled
  // grid so notes overlap a little but nobody gets buried dead-center.
  const cols = Math.max(3, Math.floor(w / (size * 1.18)));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = size * 1.12;
  const height = Math.max(vp.h, topSafe + rows * cellH + margin * 1.5);
  const h = height - margin - topSafe;
  const cellH2 = h / rows;

  const targets = drawings.map((d, i) => {
    const r1 = hash(d.id + ":sx");
    const r2 = hash(d.id + ":sy");
    const r3 = hash(d.id + ":sr");
    // shuffle cell assignment deterministically
    const cell = Math.floor(hash(d.id + ":cell") * n * 7.13 + i * 3.7) % n;
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);
    return {
      x: margin + cx * cellW + cellW / 2 + (r1 - 0.5) * cellW * 1.4,
      y: topSafe + cy * cellH2 + cellH2 / 2 + (r2 - 0.5) * cellH2 * 1.4,
      r: (r3 - 0.5) * 24,
      s: 1,
      z: Math.floor(hash(d.id + ":z") * n),
    };
  });

  return { targets, info: { height } };
}

// ------------------------------------------------------------------ grid

export type GridInfo = { contentHeight: number; cell: number };

export function gridTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  wantedCols = 5
): { targets: NoteTarget[]; info: GridInfo } {
  const pad = Math.max(20, vp.w * 0.04);
  const topSafe = 108;
  const gap = vp.w < 640 ? 14 : 24;
  // honor the size control, but never let cells get unusably small
  const maxCols = Math.max(2, Math.floor((vp.w - pad * 2 + gap) / (72 + gap)));
  const cols = Math.max(2, Math.min(wantedCols, maxCols));
  const cell = (vp.w - pad * 2 - gap * (cols - 1)) / cols;

  const base = baseNoteSize(vp);
  const n = drawings.length;
  const labelRoom = Math.max(24, cell * 0.17);
  const targets = drawings.map((d, i) => {
    const k = n - 1 - i; // newest first in the grid
    const col = k % cols;
    const row = Math.floor(k / cols);
    const jx = (hash(d.id + ":gx") - 0.5) * 6;
    const jy = (hash(d.id + ":gy") - 0.5) * 6;
    const jr = (hash(d.id + ":gr") - 0.5) * 3.6;
    return {
      x: pad + col * (cell + gap) + cell / 2 + jx,
      y: topSafe + row * (cell + gap + labelRoom) + cell / 2 + jy,
      r: jr,
      s: cell / base,
      z: i,
    };
  });

  const rows = Math.ceil(n / cols);
  return {
    targets,
    info: {
      contentHeight: topSafe + rows * (cell + gap + labelRoom) + pad,
      cell,
    },
  };
}

// ----------------------------------------------------------------- stack

export const STACK_VISIBLE_DEPTH = 7;

/**
 * Stack order is chronological with the NEWEST on top (PRD §12.3).
 * `peeled` = how many notes have been peeled off so far.
 *
 * The under-stack is completely static (per-note constant jitter, no
 * depth-dependent motion) so pulling a note off never disturbs the pile —
 * it reads as an infinite pad. Peeled notes land in a messy pile on the
 * "floor" at the bottom of the viewport.
 */
export function stackTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  peeled: number
): NoteTarget[] {
  const n = drawings.length;
  const size = baseNoteSize(vp);
  const cx = vp.w / 2;
  const cy = vp.h / 2 - vp.h * 0.02;

  return drawings.map((d, i) => {
    const depth = n - 1 - i - peeled; // 0 = current top, negative = peeled away
    if (depth < 0) {
      const k = -depth; // 1 = most recently peeled
      const r1 = hash(d.id + ":fx");
      const r2 = hash(d.id + ":fy");
      const r3 = hash(d.id + ":fr");
      return {
        x: cx + (r1 - 0.5) * Math.min(vp.w * 0.42, size * 4.6),
        y: vp.h - size * 0.85 - r2 * size * 0.55,
        r: (r3 - 0.5) * 56,
        s: 1.25,
        z: 4000 - k, // freshest peel sits on top of the floor pile
        hidden: k > 30,
      };
    }
    const r1 = hash(d.id + ":sx2");
    const r2 = hash(d.id + ":sy2");
    const r3 = hash(d.id + ":sr2");
    const under = depth === 0 ? 0 : 1;
    return {
      x: cx + under * (r1 - 0.5) * 9,
      y: cy + under * (r2 - 0.5) * 9,
      r: under * (r3 - 0.5) * 4.5,
      s: 2.6,
      z: n - depth,
      hidden: depth > STACK_VISIBLE_DEPTH,
    };
  });
}

// -------------------------------------------------------------- timeline

export type TimelineInfo = {
  focusIndex: number;
  /** anchor points (x,y) where visible notes hang, for drawing the thread */
  anchors: { x: number; y: number; i: number }[];
};

/**
 * Notes hang from a gently curved clothesline. `t` is a continuous
 * position in note-index units (0 = oldest). Scroll changes t.
 * `swing` (deg) is the inertial pendulum offset supplied by the engine.
 */
export function timelineTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  t: number,
  swing = 0
): { targets: NoteTarget[]; info: TimelineInfo } {
  const n = drawings.length;
  const size = baseNoteSize(vp);
  const spacing = Math.max(size * 1.2, vp.w * 0.125);
  const cx = vp.w / 2;
  const threadY = vp.h * 0.3;
  const focusIndex = Math.max(0, Math.min(n - 1, Math.round(t)));
  const anchors: TimelineInfo["anchors"] = [];

  const targets = drawings.map((d, i) => {
    const off = i - t; // 0 = focused, in note units
    const x = cx + off * spacing;
    if (Math.abs(off) > (vp.w / spacing) * 0.75 + 2) {
      return { x, y: threadY + size, r: 0, s: 0.7, z: 0, hidden: true };
    }
    // thread sags a touch toward the middle of the viewport
    const sag = Math.sin(((x / vp.w) * Math.PI)) * vp.h * 0.03;
    const focus = Math.max(0, 1 - Math.abs(off)); // 1 at focus, 0 beyond 1 unit
    const sway = (hash(d.id + ":tw") - 0.5) * 6;
    const anchorY = threadY + sag;
    anchors.push({ x, y: anchorY, i });
    return {
      x,
      y: anchorY + size * (0.58 + 0.62 * focus), // focused note hangs lower & bigger
      r: sway * (1 - focus * 0.8) + swing * (0.7 + hash(d.id + ":sw") * 0.6),
      s: 0.78 + focus * 1.42,
      z: 100 - Math.round(Math.abs(off) * 10),
    };
  });

  anchors.sort((a, b) => a.x - b.x);
  return { targets, info: { focusIndex, anchors } };
}
