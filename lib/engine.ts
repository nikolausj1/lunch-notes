import { LunchDrawing, ViewMode } from "./types";
import {
  NoteTarget,
  Viewport,
  baseNoteSize,
  gridTargets,
  scatterTargets,
  stackTargets,
  timelineTargets,
  TimelineInfo,
} from "./layouts";
import { hash } from "./drawings";

type NoteSim = {
  x: number; y: number; r: number; s: number;
  vx: number; vy: number; vr: number;
  tx: number; ty: number; tr: number; ts: number;
  z: number;
  hidden: boolean;
  delay: number;      // ms before this note starts moving (stagger)
  hoverAmt: number;   // 0..1 proximity glow used for shadow/lift
  el: HTMLDivElement | null;
  // last written values (dirty-checking DOM writes)
  wx: number; wy: number; wr: number; ws: number; wz: number;
  wHidden: boolean; wState: string;
};

export type EngineCallbacks = {
  /** focused note index (stack top / timeline focus) or null */
  onFocus?: (index: number | null, mode: ViewMode) => void;
  /** scatter hover tooltip */
  onHover?: (index: number | null) => void;
  /** timeline thread geometry, called every frame while in timeline */
  onThread?: (anchors: TimelineInfo["anchors"], tension: number, vp: Viewport) => void;
  /** stack peel progress 0..1 for the current top note */
  onPeel?: (progress: number) => void;
};

const PEEL_DIST = 340; // wheel px to fully peel one note

export class NotesEngine {
  drawings: LunchDrawing[];
  notes: NoteSim[];
  vp: Viewport = { w: 1200, h: 800 };
  mode: ViewMode = "scatter";
  settled = false;
  cb: EngineCallbacks;

  // grid
  scroll = 0; scrollTarget = 0; contentHeight = 0;
  // stack
  peeled = 0; peelAccum = 0;
  // timeline
  t = 0; tTarget = 0; tension = 0;
  // scatter pointer state
  pointer = { x: -9999, y: -9999, px: -9999, py: -9999, down: false, sweeping: false };
  dragIndex: number | null = null;
  dragOffset = { x: 0, y: 0 };
  zCounter = 10000;
  hoverIndex: number | null = null;
  focusIndex: number | null = null;

  private raf = 0;
  private last = 0;
  private running = false;
  private root: HTMLElement | null = null;

  setRoot(el: HTMLElement | null) {
    this.root = el;
    this.root?.style.setProperty("--note-size", `${this.noteSize}px`);
  }

  constructor(drawings: LunchDrawing[], cb: EngineCallbacks = {}) {
    this.drawings = drawings;
    this.cb = cb;
    this.notes = drawings.map((d) => ({
      x: 0, y: 0, r: 0, s: 0.2, vx: 0, vy: 0, vr: 0,
      tx: 0, ty: 0, tr: 0, ts: 1, z: 0, hidden: false, delay: 0, hoverAmt: 0,
      el: null,
      wx: Infinity, wy: Infinity, wr: Infinity, ws: Infinity, wz: -1, wHidden: false, wState: "",
    }));
    // birth position: a pile at center (loading experience scatters from here)
    this.notes.forEach((n, i) => {
      const rr = hash(drawings[i].id + ":birth");
      n.x = 0; n.y = 0; // set properly once viewport known
      n.r = (rr - 0.5) * 30;
    });
  }

  attach(i: number, el: HTMLDivElement | null) {
    if (this.notes[i]) this.notes[i].el = el;
  }

  /** First reveal after loading: spring from the birth pile with stagger. */
  reveal() {
    this.applyMode(this.mode, true);
  }

  setViewport(vp: Viewport, first = false) {
    this.vp = vp;
    this.root?.style.setProperty("--note-size", `${this.noteSize}px`);
    if (first) {
      this.notes.forEach((n) => {
        n.x = vp.w / 2 + (n.r / 30) * 24;
        n.y = vp.h / 2;
      });
    }
    this.applyMode(this.mode, false);
  }

  get noteSize() {
    return baseNoteSize(this.vp);
  }

  // ------------------------------------------------------------- modes

  setMode(mode: ViewMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.settled = false;
    this.dragIndex = null;
    this.setHover(null);
    this.notes.forEach((n) => n.el?.style.setProperty("--peel", "0"));
    if (mode === "stack") { this.peelAccum = 0; this.cb.onPeel?.(0); }
    if (mode === "timeline") { this.tTarget = this.t = Math.max(0, this.drawings.length - 1); }
    if (mode === "grid") { this.scroll = this.scrollTarget = 0; }
    this.applyMode(mode, true);
  }

  private applyMode(mode: ViewMode, stagger: boolean) {
    let targets: NoteTarget[];
    if (mode === "scatter") {
      targets = scatterTargets(this.drawings, this.vp);
    } else if (mode === "grid") {
      const g = gridTargets(this.drawings, this.vp);
      targets = g.targets;
      this.contentHeight = g.info.contentHeight;
      this.scrollTarget = Math.min(this.scrollTarget, this.maxScroll);
    } else if (mode === "stack") {
      targets = stackTargets(this.drawings, this.vp, this.peeled);
      this.updateFocus(this.stackTopIndex);
    } else {
      const tl = timelineTargets(this.drawings, this.vp, this.t);
      targets = tl.targets;
      this.updateFocus(tl.info.focusIndex);
    }
    const n = this.notes.length;
    targets.forEach((t, i) => {
      const note = this.notes[i];
      note.tx = t.x; note.ty = t.y; note.tr = t.r; note.ts = t.s;
      note.z = t.z; note.hidden = !!t.hidden;
      note.delay = stagger ? hash(this.drawings[i].id + mode) * Math.min(420, n * 3.2) : 0;
    });
    if (mode === "scatter") this.updateFocus(null);
    if (mode === "grid") this.updateFocus(null);
  }

  get maxScroll() {
    return Math.max(0, this.contentHeight - this.vp.h);
  }

  get stackTopIndex() {
    return Math.max(0, this.drawings.length - 1 - this.peeled);
  }

  private updateFocus(idx: number | null) {
    if (idx !== this.focusIndex) {
      this.focusIndex = idx;
      this.cb.onFocus?.(idx, this.mode);
    }
  }

  private setHover(idx: number | null) {
    if (idx !== this.hoverIndex) {
      this.hoverIndex = idx;
      this.cb.onHover?.(idx);
    }
  }

  // ------------------------------------------------------------- input

  onWheel(dy: number) {
    if (this.mode === "grid") {
      this.scrollTarget = Math.max(0, Math.min(this.maxScroll, this.scrollTarget + dy));
    } else if (this.mode === "timeline") {
      // scroll down travels back in time (newest sits at the end)
      const n = this.drawings.length;
      this.tTarget = Math.max(0, Math.min(n - 1, this.tTarget - dy / 260));
    } else if (this.mode === "stack") {
      this.peelAccum += dy;
      if (this.peelAccum < 0) {
        // un-peel: bring the last peeled note back
        if (this.peeled > 0 && this.peelAccum < -40) {
          this.peeled--;
          this.peelAccum = 0;
          this.applyMode("stack", false);
          this.updateFocus(this.stackTopIndex);
        } else if (this.peelAccum < 0) this.peelAccum = 0;
      }
      if (this.peelAccum >= PEEL_DIST) {
        if (this.peeled < this.drawings.length - 1) {
          this.peeled++;
          this.peelAccum = 0;
          this.applyMode("stack", false);
          this.updateFocus(this.stackTopIndex);
          // give the freshly peeled note a fling toward the discard pile
          const peeledNote = this.notes[this.stackTopIndex + 1];
          if (peeledNote) { peeledNote.vx = -700; peeledNote.vy = -950; }
        } else {
          this.peelAccum = PEEL_DIST - 1;
        }
      }
      this.cb.onPeel?.(this.peelAccum / PEEL_DIST);
    }
  }

  /** role: index of note pressed, or null for empty surface */
  onPointerDown(x: number, y: number, noteIndex: number | null) {
    this.pointer.down = true;
    this.pointer.x = this.pointer.px = x;
    this.pointer.y = this.pointer.py = y;
    if (this.mode !== "scatter") return;
    if (noteIndex != null) {
      this.dragIndex = noteIndex;
      const n = this.notes[noteIndex];
      this.dragOffset = { x: n.x - x, y: n.y - y };
      n.z = ++this.zCounter;
    } else {
      this.pointer.sweeping = true;
    }
  }

  onPointerMove(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  onPointerUp() {
    this.pointer.down = false;
    this.pointer.sweeping = false;
    if (this.dragIndex != null) {
      const n = this.notes[this.dragIndex];
      // release momentum comes from tracked velocity already
      n.vr = (hash(this.drawings[this.dragIndex].id + n.x.toFixed(0)) - 0.5) * 0.15;
      this.dragIndex = null;
    }
  }

  pointerLeft() {
    this.pointer.x = this.pointer.px = -9999;
    this.pointer.y = this.pointer.py = -9999;
    this.setHover(null);
  }

  // -------------------------------------------------------------- loop

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt, now);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number, now: number) {
    const { mode } = this;

    // smooth internal scroll positions
    if (mode === "grid") {
      const prev = this.scroll;
      this.scroll += (this.scrollTarget - this.scroll) * Math.min(1, dt * 10);
      if (Math.abs(this.scroll - prev) > 0.05) {
        // scroll shifts the whole grid: targets stay in content space,
        // render subtracts scroll (no per-note recompute needed)
      }
    } else if (mode === "timeline") {
      const prevT = this.t;
      this.t += (this.tTarget - this.t) * Math.min(1, dt * 7);
      const vel = Math.abs(this.t - prevT) / Math.max(dt, 0.001);
      this.tension += (Math.min(1, vel / 6) - this.tension) * Math.min(1, dt * 5);
      const tl = timelineTargets(this.drawings, this.vp, this.t);
      tl.targets.forEach((tt, i) => {
        const note = this.notes[i];
        note.tx = tt.x; note.ty = tt.y; note.tr = tt.r; note.ts = tt.s;
        note.z = tt.z; note.hidden = !!tt.hidden;
      });
      this.updateFocus(tl.info.focusIndex);
      this.cb.onThread?.(tl.info.anchors, this.tension, this.vp);
    }

    const scatterPhysics = mode === "scatter" && this.settled;
    const p = this.pointer;
    const size = this.noteSize;

    // sweep segment for this frame
    const sweepDx = p.x - p.px;
    const sweepDy = p.y - p.py;
    const sweeping = this.pointer.sweeping && (Math.abs(sweepDx) + Math.abs(sweepDy) > 0.5);

    let allSettled = true;
    let bestHover: { i: number; d: number } | null = null;

    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.hidden) continue;

      if (n.delay > 0) {
        n.delay -= dt * 1000;
        allSettled = false;
        continue;
      }

      if (this.dragIndex === i) {
        // strong spring to pointer (velocities in px/s)
        const gx = p.x + this.dragOffset.x;
        const gy = p.y + this.dragOffset.y;
        n.vx += (gx - n.x) * 900 * dt - n.vx * Math.min(1, dt * 34);
        n.vy += (gy - n.y) * 900 * dt - n.vy * Math.min(1, dt * 34);
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.r += (0 - n.r) * Math.min(1, dt * 6);
        n.s += (n.ts * 1.06 - n.s) * Math.min(1, dt * 12);
        n.hoverAmt = 1;
        allSettled = false;
        continue;
      }

      if (scatterPhysics) {
        // friction (all velocities in px/s or deg/s)
        const fr = Math.exp(-dt * 3.2);
        n.vx *= fr; n.vy *= fr; n.vr *= fr;

        // hover proximity breeze
        if (!p.down) {
          const dx = n.x - p.x;
          const dy = n.y - p.y;
          const d = Math.hypot(dx, dy);
          const R = size * 1.5;
          if (d < R && d > 0.001) {
            const a = (1 - d / R) ** 2 * 460 * dt;
            n.vx += (dx / d) * a;
            n.vy += (dy / d) * a;
            n.vr += (dx / d) * a * 0.25;
            n.hoverAmt = Math.min(1, n.hoverAmt + (1 - d / R) * dt * 8);
          }
          if (d < size * 0.55 && (!bestHover || d < bestHover.d)) bestHover = { i, d };
        }

        // sweep push: notes pick up a fraction of the pointer's velocity
        if (sweeping && dt > 0.001) {
          const d = distToSegment(n.x, n.y, p.px, p.py, p.x, p.y);
          const R = size * 1.15;
          if (d < R) {
            const f = (1 - d / R) * 0.16;
            n.vx += (sweepDx / dt) * f * dt * 14;
            n.vy += (sweepDy / dt) * f * dt * 14;
            n.vr += (hash(this.drawings[i].id) - 0.5) * f * 260 * dt * 14;
          }
        }

        // speed cap keeps sweeps lively but controlled
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 1600) { n.vx *= 1600 / sp; n.vy *= 1600 / sp; }

        n.hoverAmt = Math.max(0, n.hoverAmt - dt * 3);
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.r += n.vr * dt;

        // soft bounds
        const m = size * 0.45;
        const topSafe = 80;
        if (n.x < m) { n.x = m; n.vx = Math.abs(n.vx) * 0.45; }
        if (n.x > this.vp.w - m) { n.x = this.vp.w - m; n.vx = -Math.abs(n.vx) * 0.45; }
        if (n.y < topSafe + m * 0.4) { n.y = topSafe + m * 0.4; n.vy = Math.abs(n.vy) * 0.45; }
        if (n.y > this.vp.h - m) { n.y = this.vp.h - m; n.vy = -Math.abs(n.vy) * 0.45; }

        // gentle scale relax
        n.s += (1 + n.hoverAmt * 0.04 - n.s) * Math.min(1, dt * 10);
      } else {
        // spring toward target
        const st = 170, dp = 20;
        n.vx += (n.tx - n.x) * st * dt - n.vx * dp * dt;
        n.vy += (n.ty - n.y) * st * dt - n.vy * dp * dt;
        n.vr += (n.tr - n.r) * st * dt - n.vr * dp * dt;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.r += n.vr * dt;
        n.s += (n.ts - n.s) * Math.min(1, dt * 9);
        n.hoverAmt = Math.max(0, n.hoverAmt - dt * 3);
        const still =
          Math.abs(n.tx - n.x) < 0.5 && Math.abs(n.ty - n.y) < 0.5 &&
          Math.abs(n.vx) + Math.abs(n.vy) < 2;
        if (!still) allSettled = false;
      }
    }

    // pairwise separation while things are moving in scatter
    if (scatterPhysics) {
      const minD = size * 0.72;
      for (let i = 0; i < this.notes.length; i++) {
        const a = this.notes[i];
        if (a.hidden) continue;
        const moving = Math.abs(a.vx) + Math.abs(a.vy) > 0.12;
        if (!moving && this.dragIndex !== i) continue;
        for (let j = 0; j < this.notes.length; j++) {
          if (i === j) continue;
          const b = this.notes[j];
          if (b.hidden) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < minD && d > 0.001) {
            const push = ((minD - d) / minD) * 520 * dt;
            b.vx += (dx / d) * push;
            b.vy += (dy / d) * push;
          }
        }
      }
      this.setHover(p.down ? null : bestHover ? bestHover.i : null);
    }

    if (!scatterPhysics && allSettled && !this.settled) {
      this.settled = true;
      if (this.mode === "scatter") {
        // hand over from springs to free physics
        this.notes.forEach((n) => { n.vx = 0; n.vy = 0; n.vr = 0; });
      }
    }
    if (!allSettled) this.settled = false;

    p.px = p.x;
    p.py = p.y;
  }

  private render() {
    const size = this.noteSize;
    const half = size / 2;
    const scrollOff = this.mode === "grid" ? this.scroll : 0;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      const el = n.el;
      if (!el) continue;
      if (n.hidden !== n.wHidden) {
        el.style.visibility = n.hidden ? "hidden" : "visible";
        n.wHidden = n.hidden;
      }
      if (n.hidden) continue;
      let x = n.x - half;
      let y = n.y - half - scrollOff;
      let r = n.r;
      // continuous peel transform on the stack's top note
      if (this.mode === "stack" && i === this.stackTopIndex && this.peelAccum > 0) {
        const pr = this.peelAccum / PEEL_DIST;
        x -= pr * pr * this.vp.w * 0.2;
        y -= pr * pr * this.vp.h * 0.38;
        r -= pr * 20;
        el.style.setProperty("--peel", pr.toFixed(3));
        n.wx = Infinity; // force write while peeling
      } else if (this.mode === "stack" && el.style.getPropertyValue("--peel") !== "" && el.style.getPropertyValue("--peel") !== "0") {
        el.style.setProperty("--peel", "0");
      }
      if (
        Math.abs(x - n.wx) > 0.05 || Math.abs(y - n.wy) > 0.05 ||
        Math.abs(r - n.wr) > 0.05 || Math.abs(n.s - n.ws) > 0.002
      ) {
        el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${n.s})`;
        n.wx = x; n.wy = y; n.wr = r; n.ws = n.s;
      }
      const z = this.dragIndex === i ? this.zCounter : n.z;
      if (z !== n.wz) {
        el.style.zIndex = String(z);
        n.wz = z;
      }
      const state =
        this.dragIndex === i ? "drag" : n.hoverAmt > 0.35 ? "hover" : "rest";
      if (state !== n.wState) {
        el.dataset.state = state;
        n.wState = state;
      }
    }
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
