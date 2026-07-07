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

export function scatterTargets(
  drawings: LunchDrawing[],
  vp: Viewport
): NoteTarget[] {
  const size = baseNoteSize(vp);
  const margin = size * 0.62;
  const topSafe = 96; // keep the mode selector breathable
  const w = vp.w - margin * 2;
  const h = vp.h - margin - topSafe;
  const n = drawings.length;

  // Organic distribution: jittered poisson-ish placement on a shuffled
  // grid so notes overlap a little but nobody gets buried dead-center.
  const cols = Math.ceil(Math.sqrt((n * w) / h));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = h / rows;

  return drawings.map((d, i) => {
    const r1 = hash(d.id + ":sx");
    const r2 = hash(d.id + ":sy");
    const r3 = hash(d.id + ":sr");
    // shuffle cell assignment deterministically
    const cell = Math.floor(hash(d.id + ":cell") * n * 7.13 + i * 3.7) % n;
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);
    return {
      x: margin + cx * cellW + cellW / 2 + (r1 - 0.5) * cellW * 1.4,
      y: topSafe + cy * cellH + cellH / 2 + (r2 - 0.5) * cellH * 1.4,
      r: (r3 - 0.5) * 24,
      s: 1,
      z: Math.floor(hash(d.id + ":z") * n),
    };
  });
}

// ------------------------------------------------------------------ grid

export type GridInfo = { contentHeight: number; cell: number };

export function gridTargets(
  drawings: LunchDrawing[],
  vp: Viewport
): { targets: NoteTarget[]; info: GridInfo } {
  const pad = Math.max(20, vp.w * 0.04);
  const topSafe = 108;
  const minCell = vp.w < 640 ? 104 : 148;
  const gap = vp.w < 640 ? 14 : 22;
  const cols = Math.max(2, Math.floor((vp.w - pad * 2 + gap) / (minCell + gap)));
  const cell = (vp.w - pad * 2 - gap * (cols - 1)) / cols;

  const base = baseNoteSize(vp);
  const n = drawings.length;
  const targets = drawings.map((d, i) => {
    const k = n - 1 - i; // newest first in the grid
    const col = k % cols;
    const row = Math.floor(k / cols);
    const jx = (hash(d.id + ":gx") - 0.5) * 5;
    const jy = (hash(d.id + ":gy") - 0.5) * 5;
    const jr = (hash(d.id + ":gr") - 0.5) * 3.2;
    return {
      x: pad + col * (cell + gap) + cell / 2 + jx,
      y: topSafe + row * (cell + gap + 26) + cell / 2 + jy, // +26 leaves room for date labels
      r: jr,
      s: cell / base,
      z: i,
    };
  });

  const rows = Math.ceil(drawings.length / cols);
  return {
    targets,
    info: { contentHeight: topSafe + rows * (cell + gap + 26) + pad, cell },
  };
}

// ----------------------------------------------------------------- stack

export const STACK_VISIBLE_DEPTH = 7;

/**
 * Stack order is chronological with the NEWEST on top (PRD §12.3).
 * `peeled` = how many notes have been peeled off so far.
 * drawings[] is oldest->newest, so top of stack = index n-1-peeled.
 */
export function stackTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  peeled: number
): NoteTarget[] {
  const n = drawings.length;
  const cx = vp.w / 2;
  const cy = vp.h / 2 + vp.h * 0.03;

  return drawings.map((d, i) => {
    const depth = n - 1 - i - peeled; // 0 = current top, negative = peeled away
    if (depth < 0) {
      // peeled: rests off to the upper-left like a discarded pile
      const k = Math.min(-depth, 14);
      const rr = hash(d.id + ":pl");
      return {
        x: cx - vp.w * 0.38 - k * 2,
        y: cy - vp.h * 0.34 + k * 3,
        r: -14 + (rr - 0.5) * 18,
        s: 0.55,
        z: 500 + depth, // most recently peeled sits on top of discard pile
        hidden: -depth > 12,
      };
    }
    const rr = hash(d.id + ":st");
    const jitter = depth === 0 ? 0 : (rr - 0.5) * 7;
    return {
      x: cx + jitter,
      y: cy + Math.min(depth, STACK_VISIBLE_DEPTH) * 2.4 + jitter * 0.4,
      r: depth === 0 ? 0 : (rr - 0.5) * 5,
      s: 2.6 - Math.min(depth, STACK_VISIBLE_DEPTH) * 0.012,
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
 */
export function timelineTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  t: number
): { targets: NoteTarget[]; info: TimelineInfo } {
  const n = drawings.length;
  const size = baseNoteSize(vp);
  const spacing = Math.max(size * 1.55, vp.w * 0.19);
  const cx = vp.w / 2;
  const threadY = vp.h * 0.34;
  const focusIndex = Math.max(0, Math.min(n - 1, Math.round(t)));
  const anchors: TimelineInfo["anchors"] = [];

  const targets = drawings.map((d, i) => {
    const off = i - t; // 0 = focused, in note units
    const x = cx + off * spacing;
    if (Math.abs(off) > (vp.w / spacing) * 0.75 + 2) {
      return { x, y: threadY + size, r: 0, s: 0.7, z: 0, hidden: true };
    }
    // thread sags a touch toward the middle of the viewport
    const sag = Math.sin(((x / vp.w) * Math.PI)) * vp.h * 0.035;
    const focus = Math.max(0, 1 - Math.abs(off)); // 1 at focus, 0 beyond 1 unit
    const sway = (hash(d.id + ":tw") - 0.5) * 7;
    const anchorY = threadY + sag;
    anchors.push({ x, y: anchorY, i });
    return {
      x,
      y: anchorY + size * (0.62 + 0.5 * focus), // focused note hangs lower & bigger
      r: sway * (1 - focus * 0.8),
      s: 0.85 + focus * 0.85,
      z: 100 - Math.round(Math.abs(off) * 10),
    };
  });

  anchors.sort((a, b) => a.x - b.x);
  return { targets, info: { focusIndex, anchors } };
}
