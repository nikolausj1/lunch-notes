import { LunchDrawing, ViewMode } from "./types";
import { hash } from "./drawings";

export type NoteTarget = {
  x: number; // center position, px in viewport space
  y: number;
  r: number; // rotation deg
  s: number; // scale (1 = base note size)
  z: number; // z-index
  hidden?: boolean; // fully skip rendering (deep stack layers)
  blur?: number; // px, depth-of-field (timeline)
  opacity?: number; // 0..1 (timeline pass-behind fade)
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
  // grid so notes overlap generously and the table reads as covered.
  const cols = Math.max(3, Math.floor(w / (size * 0.92)));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = size * 0.86;
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
  const cy = vp.h * 0.58; // sits low so the torn-off pile has room above

  return drawings.map((d, i) => {
    const depth = n - 1 - i - peeled; // 0 = current top, negative = peeled away
    if (depth < 0) {
      // peeled notes fly UP off the pad and pile above the stack
      const k = -depth; // 1 = most recently peeled
      const r1 = hash(d.id + ":fx");
      const r2 = hash(d.id + ":fy");
      const r3 = hash(d.id + ":fr");
      return {
        x: cx + (r1 - 0.5) * Math.min(vp.w * 0.52, size * 5.4),
        y: size * (1.05 + r2 * 0.6),
        r: (r3 - 0.5) * 56,
        s: 1.15,
        z: 4000 - k, // freshest peel sits on top of the pile
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
  /** anchor points (x,y) where visible notes hang, for drawing the rope */
  anchors: { x: number; y: number; i: number }[];
};

/**
 * The line of notes recedes almost straight back — barely any lateral
 * drift, so the past reads as a deck stacked into the distance. Notes
 * that pass the viewer exit big through the top corner of the frame.
 */
export function timelineGeometry(vp: Viewport) {
  return {
    focus: { x: vp.w * 0.5, y: vp.h * 0.4 },
    van: { x: vp.w * 0.555, y: vp.h * 0.27 }, // vanishing point
    exit: { x: vp.w * 0.12, y: -vp.h * 0.34 }, // top-left, over the camera
  };
}

/**
 * 3D clothesline: the rope comes in over the viewer's left shoulder and
 * recedes to a vanishing point. `t` is a continuous position in note-index
 * units. The focused note (u = 0) is sharp; notes about to pass over the
 * shoulder (u < 0) are huge and out-of-focus; notes far down the rope
 * (u >> 0, older) shrink and soften into the distance.
 */
export function timelineTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  t: number
): { targets: NoteTarget[]; info: TimelineInfo } {
  const n = drawings.length;
  const size = baseNoteSize(vp);
  const { focus, van } = timelineGeometry(vp);
  const focusIndex = Math.max(0, Math.min(n - 1, Math.round(t)));
  const anchors: TimelineInfo["anchors"] = [];

  const { exit } = timelineGeometry(vp);
  const targets = drawings.map((d, i) => {
    const u = t - i; // 0 = focused; + = older, into the distance; - = passed by
    if (u < 0) {
      // passing the viewer: rush up through the top corner of the frame,
      // getting bigger and softer the whole way out
      if (u < -2.1) return { x: exit.x, y: exit.y, r: 0, s: 0.1, z: 0, hidden: true };
      const p = Math.pow(0.74, u * 2.3);
      const k = Math.pow(Math.min(1, -u / 1.7), 1.15);
      const cy0 = focus.y + size * 2.1 * 0.56;
      return {
        x: focus.x + (exit.x - focus.x) * k,
        y: cy0 + (exit.y - cy0) * k,
        r: (hash(d.id + ":tw") - 0.5) * 12 * k,
        s: Math.min(9, 2.1 * p),
        blur: Math.min(22, -u * 12),
        opacity: u < -0.9 ? Math.max(0, 1 - (-u - 0.9) / 1.0) : 1,
        z: Math.round(2000 * p),
      };
    }
    const p = Math.pow(0.74, u); // perspective factor: 1 at focus, ->0 far away
    if (p < 0.055) {
      return { x: van.x, y: van.y, r: 0, s: 0.1, z: 0, hidden: true };
    }
    // slight per-note drift so the receding deck isn't perfectly aligned
    const jx = (hash(d.id + ":jx") - 0.5) * size * 0.3 * (1 - p);
    const ax = van.x + (focus.x - van.x) * p + jx;
    const ay = van.y + (focus.y - van.y) * p;
    const s = Math.min(7, 2.1 * p);
    const blur = Math.max(0, Math.min(9, (u - 2.4) * 1.5));
    if (p > 0.18) anchors.push({ x: ax, y: ay, i });
    const sway = (hash(d.id + ":tw") - 0.5) * 5;
    return {
      x: ax,
      y: ay + size * s * 0.56, // hangs below its anchor point
      r: sway * (0.4 + 0.6 * Math.min(1, u)),
      s,
      z: Math.round(2000 * p),
      blur,
      opacity: 1,
    };
  });

  anchors.sort((a, b) => a.x - b.x);
  return { targets, info: { focusIndex, anchors } };
}
