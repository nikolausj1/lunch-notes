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
  // grid, packed tight so the table reads as fully covered in paper.
  const cols = Math.max(4, Math.floor(w / (size * 0.68)));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = size * 0.62;
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
  // phones reserve a right gutter so notes never run under the time strip
  const padR = vp.w < 640 ? pad + 34 : pad;
  const topSafe = vp.w < 640 ? 150 : 108; // clear the stacked mobile chrome
  const gap = vp.w < 640 ? 14 : 24;
  // phones remap S/M/L to their own column counts (4/3/2) — otherwise all
  // three sizes clamp to the same layout and the control does nothing
  const wanted =
    vp.w < 640 ? (wantedCols >= 7 ? 4 : wantedCols >= 5 ? 3 : 2) : wantedCols;
  // honor the size control, but never let cells get unusably small
  const minCell = vp.w < 640 ? 56 : 72;
  const maxCols = Math.max(2, Math.floor((vp.w - pad - padR + gap) / (minCell + gap)));
  const cols = Math.max(2, Math.min(wanted, maxCols));
  const cell = (vp.w - pad - padR - gap * (cols - 1)) / cols;

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

// ------------------------------------------------------------------ wall

export type WallInfo = { cell: number; ringW: number; rows: number; height: number };

/** Wall layout knobs (values settled with the tuning panel, 2026-08-22) */
export type WallTuning = {
  /** photo size as a fraction of the base note size */
  size: number;
  /** horizontal air between photos, px */
  hGap: number;
  /** vertical air between rows, px */
  vGap: number;
};

export const WALL_TUNING_DEFAULT: WallTuning = { size: 0.9, hGap: 9, vGap: 12 };

/**
 * The wall (Moments-inspired): every note pinned in horizontal rows that
 * fill the viewport edge to edge. Each row is an infinite ring drifting
 * slowly sideways — odd rows travel one way, even rows the other — driven
 * by `drift` (px). Every ring spans the viewport plus one cell of overhang,
 * so the wrap jump always happens fully offscreen. The engine adds the
 * cursor "parting" and the focused-moment clearing on top of these targets.
 */
export function wallTargets(
  drawings: LunchDrawing[],
  vp: Viewport,
  drift = 0,
  tune: WallTuning = WALL_TUNING_DEFAULT
): { targets: NoteTarget[]; info: WallInfo } {
  const n = Math.max(1, drawings.length);
  const base = baseNoteSize(vp);
  // photo size and the air around it are direct, independent knobs; the
  // wall runs taller than the screen and the user scrolls down it
  const note = base * tune.size;
  const cellH = note + tune.vGap;
  const pitch = note + tune.hGap;
  const perRow = Math.max(3, Math.round(vp.w / pitch) + 1);
  const rows = Math.max(2, Math.ceil(n / perRow));
  // spread notes across rows as evenly as possible (first rows get extras)
  const baseCount = Math.floor(n / rows);
  const extra = n % rows;
  // every ring spans the requested pitch, and never less than the viewport
  // plus a note, so the wrap jump stays offscreen
  const ringW = Math.max(perRow * pitch, vp.w + note * 1.2);
  const overhang = (ringW - vp.w) / 2;

  const targets = drawings.map((d, i) => {
    const k = n - 1 - i; // newest first, reading order
    let row: number, inRow: number, count: number;
    const bigRows = extra * (baseCount + 1);
    if (k < bigRows) {
      count = baseCount + 1;
      row = Math.floor(k / count);
      inRow = k % count;
    } else {
      count = baseCount;
      row = extra + Math.floor((k - bigRows) / count);
      inRow = (k - bigRows) % count;
    }
    const cellW = ringW / count;
    const dir = row % 2 === 0 ? 1 : -1;
    // each row travels at its own speed (source: 0.05–0.23 px/frame)
    const rowSpeed = 0.25 + 0.75 * hash("wallrow:" + row);
    const bx = inRow * cellW + cellW / 2 + dir * drift * rowSpeed;
    const x = ((bx % ringW) + ringW) % ringW - overhang;
    const jx = (hash(d.id + ":wx") - 0.5) * note * 0.08;
    const jy = (hash(d.id + ":wy") - 0.5) * note * 0.08;
    return {
      x: x + jx,
      y: row * cellH + cellH / 2 + jy,
      r: (hash(d.id + ":wr") - 0.5) * 7,
      s: note / base,
      z: Math.floor(hash(d.id + ":wz") * n),
    };
  });

  return {
    targets,
    info: {
      cell: note,
      ringW,
      rows,
      height: rows * cellH,
    },
  };
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
    van: { x: vp.w * 0.74, y: vp.h * 0.52 }, // recedes lower-right of center
    exit: { x: vp.w * 0.14, y: -vp.h * 0.34 }, // top-left, over the camera
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
        // stays sharp until it's genuinely on top of the camera
        blur: Math.min(22, Math.max(0, (-u - 0.65) * 20)),
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
    const blur = Math.max(0, Math.min(9, (u - 3.0) * 1.6));
    // the tail of the line fades away so it never buries the focused note
    const farFade = u > 3.2 ? Math.max(0, 1 - (u - 3.2) / 2.2) : 1;
    if (farFade <= 0.02) {
      return { x: van.x, y: van.y, r: 0, s: 0.1, z: 0, hidden: true };
    }
    if (p > 0.18) anchors.push({ x: ax, y: ay, i });
    const sway = (hash(d.id + ":tw") - 0.5) * 5;
    return {
      x: ax,
      y: ay + size * s * 0.56, // hangs below its anchor point
      r: sway * (0.4 + 0.6 * Math.min(1, u)),
      s,
      z: Math.round(2000 * p),
      blur,
      opacity: farFade,
    };
  });

  anchors.sort((a, b) => a.x - b.x);
  return { targets, info: { focusIndex, anchors } };
}
