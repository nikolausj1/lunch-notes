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
  // timeline depth-of-field + front/back pendulum swing
  blurT: number; opT: number; fb: number; fbv: number;
  el: HTMLDivElement | null;
  // last written values (dirty-checking DOM writes)
  wx: number; wy: number; wr: number; ws: number; wz: number;
  wHidden: boolean; wState: string;
  wBlur: number; wOp: number; wFb: number;
};

export type EngineCallbacks = {
  /** focused note index (stack top / timeline focus) or null */
  onFocus?: (index: number | null, mode: ViewMode) => void;
  /** scatter hold-to-inspect: index while a note is held, null on release */
  onHover?: (index: number | null) => void;
  /** viewport-space anchor for the held note's metadata, every frame */
  onHoldPos?: (x: number, y: number, flip: boolean) => void;
  /** timeline thread geometry, called every frame while in timeline */
  onThread?: (anchors: TimelineInfo["anchors"], tension: number, vp: Viewport) => void;
  /** stack peel progress 0..1 for the current top note */
  onPeel?: (progress: number) => void;
};

const PEEL_DIST = 280; // wheel px to fully peel one note

export class NotesEngine {
  drawings: LunchDrawing[];
  notes: NoteSim[];
  vp: Viewport = { w: 1200, h: 800 };
  mode: ViewMode = "scatter";
  settled = false;
  cb: EngineCallbacks;

  // grid
  scroll = 0; scrollTarget = 0; contentHeight = 0; gridCols = 5;
  gridTiltI = -1; gridTiltX = 0; gridTiltY = 0;
  gridZoom: number | null = null;
  // scatter: the desk is a virtual table taller than the viewport
  scatterScroll = 0; scatterScrollTarget = 0; scatterH = 0;
  // stack
  peeled = 0; peelAccum = 0; peelZ = 0; lastWheelAt = 0;
  stackDrag: { relX: number; startY: number; startAccum: number } | null = null;
  // timeline
  t = 0; tTarget = 0; tension = 0; tensionVel = 0; swing = 0;

  get stackDragging() {
    return this.stackDrag != null;
  }
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
      blurT: 0, opT: 1, fb: 0, fbv: 0,
      el: null,
      wx: Infinity, wy: Infinity, wr: Infinity, ws: Infinity, wz: -1, wHidden: false, wState: "",
      wBlur: -1, wOp: -1, wFb: Infinity,
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

  /**
   * Called when the tab regains focus after being hidden: rAF was paused,
   * so half-finished transitions would resume as one big unnatural glide.
   * Instead, finish them instantly — the time "passed" while away.
   */
  finishTransitions() {
    if (this.mode === "scatter" && this.settled) return;
    this.notes.forEach((n) => {
      n.delay = 0;
      n.x = n.tx; n.y = n.ty; n.r = n.tr; n.s = n.ts;
      n.vx = 0; n.vy = 0; n.vr = 0;
    });
    this.settled = true;
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
    this.stackDrag = null;
    this.gridZoom = null;
    this.setHover(null);
    this.notes.forEach((n) => {
      if (!n.el) return;
      n.el.style.setProperty("--peel", "0");
      n.el.style.setProperty("--peelZ", "0");
      n.el.style.setProperty("--blur", "0");
      n.el.style.setProperty("--fb", "0");
      n.el.style.opacity = "";
      n.blurT = 0; n.opT = 1; n.fb = 0; n.fbv = 0;
      n.wBlur = -1; n.wOp = -1; n.wFb = Infinity;
    });
    if (mode === "stack") { this.peelAccum = 0; this.peelZ = 0; this.cb.onPeel?.(0); }
    if (mode === "timeline") {
      this.tTarget = this.t = Math.max(0, this.drawings.length - 1);
      this.tension = this.tensionVel = this.swing = 0;
    }
    if (mode === "grid") { this.scroll = this.scrollTarget = 0; }
    if (mode === "scatter") { this.scatterScroll = this.scatterScrollTarget = 0; }
    this.applyMode(mode, true);
  }

  setGridCols(cols: number) {
    this.gridCols = cols;
    if (this.mode === "grid") this.applyMode("grid", false);
  }

  private applyMode(mode: ViewMode, stagger: boolean) {
    let targets: NoteTarget[];
    if (mode === "scatter") {
      const sc = scatterTargets(this.drawings, this.vp);
      targets = sc.targets;
      this.scatterH = sc.info.height;
      this.scatterScrollTarget = Math.min(this.scatterScrollTarget, this.maxScatterScroll);
    } else if (mode === "grid") {
      const g = gridTargets(this.drawings, this.vp, this.gridCols);
      targets = g.targets;
      this.contentHeight = g.info.contentHeight;
      this.scrollTarget = Math.min(this.scrollTarget, this.maxScroll);
      // click-to-zoom: the zoomed note floats front and center
      if (this.gridZoom != null && targets[this.gridZoom]) {
        const base = this.noteSize;
        const big = Math.min((this.vp.h * 0.74) / base, (this.vp.w * 0.62) / base);
        targets[this.gridZoom] = {
          x: this.vp.w / 2,
          y: this.vp.h / 2 + this.scroll,
          r: 0,
          s: big,
          z: 9000,
        };
      }
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

  get maxScatterScroll() {
    return Math.max(0, this.scatterH - this.vp.h);
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
    if (this.mode === "scatter") {
      // scroll down the virtual table to reach more notes
      this.scatterScrollTarget = Math.max(
        0,
        Math.min(this.maxScatterScroll, this.scatterScrollTarget + dy)
      );
    } else if (this.mode === "grid") {
      if (this.gridZoom != null) this.onGridClick(null); // scrolling puts it back
      this.scrollTarget = Math.max(0, Math.min(this.maxScroll, this.scrollTarget + dy));
    } else if (this.mode === "timeline") {
      // scroll down travels back in time (newest sits at the end)
      const n = this.drawings.length;
      this.tTarget = Math.max(0, Math.min(n - 1, this.tTarget - dy / 260));
    } else if (this.mode === "stack") {
      this.lastWheelAt = performance.now();
      this.peelAccum += dy;
      if (this.peelAccum <= -44) {
        // un-peel: pick the last note off the floor and press it back on
        if (this.peeled > 0) {
          this.peeled--;
          this.applyMode("stack", false);
          this.updateFocus(this.stackTopIndex);
        }
        this.peelAccum = 0;
      } else if (this.peelAccum < 0 && this.peeled === 0) {
        this.peelAccum = 0; // nothing on the floor to bring back
      }
      if (this.peelAccum >= PEEL_DIST) {
        if (this.peeled < this.drawings.length - 1) {
          this.peeled++;
          this.peelAccum = 0;
          this.applyMode("stack", false);
          this.updateFocus(this.stackTopIndex);
          this.flingPeeled();
        } else {
          this.peelAccum = PEEL_DIST - 1;
        }
      }
      this.cb.onPeel?.(this.peelAccum / PEEL_DIST);
    }
  }

  /** the note that just tore off gets tossed up toward the pile */
  private flingPeeled() {
    const i = this.stackTopIndex + 1;
    const peeledNote = this.notes[i];
    if (peeledNote && this.drawings[i]) {
      peeledNote.vx = (hash(this.drawings[i].id) - 0.5) * 600;
      peeledNote.vy = -1300;
      peeledNote.vr = (hash(this.drawings[i].id + "fl") - 0.5) * 240;
    }
  }

  /** grid click-to-zoom toggle (null = put the zoomed note back) */
  onGridClick(i: number | null) {
    if (this.mode !== "grid") return;
    this.gridZoom = i == null || i === this.gridZoom ? null : i;
    this.applyMode("grid", false);
    this.setHover(this.gridZoom);
  }

  /** role: index of note pressed, or null for empty surface */
  onPointerDown(x: number, y: number, noteIndex: number | null) {
    // pointer lives in desk space; in scatter the desk scrolls
    if (this.mode === "scatter") y += this.scatterScroll;
    this.pointer.down = true;
    this.pointer.x = this.pointer.px = x;
    this.pointer.y = this.pointer.py = y;
    if (this.mode === "stack" && noteIndex === this.stackTopIndex) {
      // grab the top note to peel it by hand; where you grab it decides
      // whether it curls straight up or from a corner
      const nn = this.notes[noteIndex];
      const w = this.noteSize * nn.s;
      const relX = Math.max(0, Math.min(1, (x - (nn.x - w / 2)) / w));
      this.stackDrag = { relX, startY: y, startAccum: this.peelAccum };
      return;
    }
    if (this.mode !== "scatter") return;
    if (noteIndex != null) {
      this.dragIndex = noteIndex;
      const n = this.notes[noteIndex];
      this.dragOffset = { x: n.x - x, y: n.y - y };
      n.z = ++this.zCounter;
      this.setHover(noteIndex); // picking up a note reveals its metadata
    } else {
      this.pointer.sweeping = true;
    }
  }

  onPointerMove(x: number, y: number) {
    if (this.mode === "scatter") y += this.scatterScroll;
    this.pointer.x = x;
    this.pointer.y = y;
    const sd = this.stackDrag;
    if (sd) {
      // hand-peel: fully responsive, follows the pointer directly
      const lift = (sd.startY - y) * 1.9;
      this.peelAccum = Math.max(0, Math.min(PEEL_DIST * 1.15, sd.startAccum + lift));
      const corner = (0.5 - sd.relX) * 2; // +1 left corner .. -1 right corner
      const cornerAmt = Math.abs(corner) < 0.34 ? 0 : corner; // middle = straight curl
      this.peelZ = cornerAmt * Math.min(1, this.peelAccum / PEEL_DIST) * 24;
      this.cb.onPeel?.(this.peelAccum / PEEL_DIST);
    }
  }

  onPointerUp() {
    if (this.stackDrag) {
      this.stackDrag = null;
      if (this.peelAccum >= PEEL_DIST * 0.55 && this.peeled < this.drawings.length - 1) {
        // torn free
        this.peeled++;
        this.peelAccum = 0;
        this.applyMode("stack", false);
        this.updateFocus(this.stackTopIndex);
        this.flingPeeled();
        this.cb.onPeel?.(0);
      }
      // otherwise the tick relaxes the half-peeled note back down
    }
    this.setHover(this.mode === "grid" ? this.gridZoom : null);
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

    // stack: a half-peeled note relaxes back down when the hand lets go
    if (mode === "stack") {
      const idle = !this.stackDrag && performance.now() - this.lastWheelAt > 260;
      if (idle && this.peelAccum > 0 && this.peelAccum < PEEL_DIST) {
        this.peelAccum *= Math.exp(-dt * 3.4);
        if (this.peelAccum < 1.5) this.peelAccum = 0;
        this.cb.onPeel?.(this.peelAccum / PEEL_DIST);
      }
      if (!this.stackDrag) this.peelZ *= Math.exp(-dt * 5);
    }

    // smooth internal scroll positions
    if (mode === "scatter") {
      this.scatterScroll +=
        (this.scatterScrollTarget - this.scatterScroll) * Math.min(1, dt * 10);
    }
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
      const tVel = (this.t - prevT) / Math.max(dt, 0.001);
      // rope tension is a spring so it bounces after a scroll stops
      const tensionGoal = Math.min(1, Math.abs(tVel) / 4);
      this.tensionVel += ((tensionGoal - this.tension) * 26 - this.tensionVel * 6) * dt;
      this.tension = Math.max(-0.05, Math.min(1.15, this.tension + this.tensionVel * dt));
      // pulling the string swings the hanging notes front/back (rotateX);
      // each note is an underdamped pendulum chasing the swing target
      this.swing = Math.max(-26, Math.min(26, tVel * 9));
      const tl = timelineTargets(this.drawings, this.vp, this.t);
      tl.targets.forEach((tt, i) => {
        const note = this.notes[i];
        note.tx = tt.x; note.ty = tt.y; note.tr = tt.r; note.ts = tt.s;
        note.z = tt.z; note.hidden = !!tt.hidden;
        note.blurT = tt.blur ?? 0;
        note.opT = tt.opacity ?? 1;
        if (!note.hidden) {
          const phase = 0.75 + hash(this.drawings[i].id + ":ph") * 0.5;
          note.fbv += ((this.swing * phase - note.fb) * 26 - note.fbv * 3.4) * dt;
          note.fb += note.fbv * dt;
        }
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
    // a bare cursor pass also swipes notes, scaled by hand speed:
    // a slow pass nudges, a fast flick sends them flying
    const moveSpeed = dt > 0.001 ? Math.hypot(sweepDx, sweepDy) / dt : 0;
    const hoverSwipeGain = !p.down
      ? 2.3 * Math.min(1, Math.pow(moveSpeed / 1500, 1.7))
      : 0;

    let allSettled = true;

    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.hidden) {
        // teleport while invisible: when this note is revealed later (e.g.
        // rising through the stack as notes peel off), it must already be
        // resting in place — never seen flying in from across the desk
        n.x = n.tx; n.y = n.ty; n.r = n.tr; n.s = n.ts;
        n.vx = 0; n.vy = 0; n.vr = 0;
        n.delay = 0;
        continue;
      }

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
        // paper trails behind the hand a little while dragged
        const trail = Math.max(-13, Math.min(13, -n.vx * 0.013));
        n.r += (trail - n.r) * Math.min(1, dt * 8);
        // holding brings the note right up close for a proper look
        n.s += (3.2 - n.s) * Math.min(1, dt * 5.5);
        n.hoverAmt = 1;
        continue;
      }

      if (scatterPhysics) {
        // friction (all velocities in px/s or deg/s)
        const fr = Math.exp(-dt * 3.2);
        n.vx *= fr; n.vy *= fr; n.vr *= fr;

        // hover proximity breeze — tight radius, steep falloff, so the
        // disturbance stays local to the cursor
        if (!p.down) {
          const dx = n.x - p.x;
          const dy = n.y - p.y;
          const d = Math.hypot(dx, dy);
          const R = size * 1.0;
          if (d < R && d > 0.001) {
            const a = (1 - d / R) ** 3 * 340 * dt;
            n.vx += (dx / d) * a;
            n.vy += (dy / d) * a;
            n.vr += (dx / d) * a * 0.22;
            n.hoverAmt = Math.min(1, n.hoverAmt + (1 - d / R) * dt * 8);
          }
        }

        // hand-swipe: dragging across the desk pushes hard; a bare cursor
        // pass pushes too, with amplitude tied to how fast the hand moved
        if (dt > 0.001 && (sweeping || hoverSwipeGain > 0.02)) {
          const d = distToSegment(n.x, n.y, p.px, p.py, p.x, p.y);
          const R = sweeping
            ? size * 1.15
            : size * (0.8 + Math.min(1.1, moveSpeed / 1500));
          if (d < R) {
            const fall = 1 - d / R;
            const gain = sweeping ? 2.24 : hoverSwipeGain;
            n.vx += (sweepDx / dt) * fall * gain * dt;
            n.vy += (sweepDy / dt) * fall * gain * dt;
            n.vr += (hash(this.drawings[i].id) - 0.5) * fall * gain * 160 * dt;
          }
        }

        // speed cap keeps sweeps lively but controlled
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 1600) { n.vx *= 1600 / sp; n.vy *= 1600 / sp; }

        n.hoverAmt = Math.max(0, n.hoverAmt - dt * 3);
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.r += n.vr * dt;

        // soft bounds (the desk extends below the viewport when scrollable)
        const m = size * 0.45;
        const topSafe = 80;
        const deskH = Math.max(this.scatterH, this.vp.h);
        if (n.x < m) { n.x = m; n.vx = Math.abs(n.vx) * 0.45; }
        if (n.x > this.vp.w - m) { n.x = this.vp.w - m; n.vx = -Math.abs(n.vx) * 0.45; }
        if (n.y < topSafe + m * 0.4) { n.y = topSafe + m * 0.4; n.vy = Math.abs(n.vy) * 0.45; }
        if (n.y > deskH - m) { n.y = deskH - m; n.vy = -Math.abs(n.vy) * 0.45; }

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

    // pairwise separation while things are moving in scatter. The push is
    // scaled by the mover's speed with a real threshold — paper has high
    // friction, so a nudge shouldn't ripple across the whole desk.
    if (scatterPhysics) {
      const minD = size * 0.72;
      for (let i = 0; i < this.notes.length; i++) {
        const a = this.notes[i];
        if (a.hidden) continue;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp < 30 && this.dragIndex !== i) continue;
        const strength = this.dragIndex === i ? 1 : Math.min(1, sp / 260);
        for (let j = 0; j < this.notes.length; j++) {
          if (i === j) continue;
          const b = this.notes[j];
          if (b.hidden) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < minD && d > 0.001) {
            const push = ((minD - d) / minD) * 520 * strength * dt;
            b.vx += (dx / d) * push;
            b.vy += (dy / d) * push;
          }
        }
      }
    }

    // grid corner-tilt: hit-test the topmost note under the pointer
    if (mode === "grid" && !p.down) {
      let best: { i: number; z: number } | null = null;
      for (let i = 0; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.hidden) continue;
        const half = (size * n.s) / 2;
        if (
          Math.abs(p.x - n.x) < half &&
          Math.abs(p.y - (n.y - this.scroll)) < half &&
          (!best || n.z > best.z)
        ) {
          best = { i, z: n.z };
        }
      }
      if (best) {
        const n = this.notes[best.i];
        const half = (size * n.s) / 2;
        this.gridTiltI = best.i;
        this.gridTiltX = ((p.x - n.x) / half) * 7; // deg for rotateY
        this.gridTiltY = (-(p.y - (n.y - this.scroll)) / half) * 7; // deg for rotateX
      } else {
        this.gridTiltI = -1;
      }
    } else {
      this.gridTiltI = -1;
    }

    // `settled` latches on: once scatter hands over to free physics it stays
    // there (dragging one note must never freeze the rest back into springs).
    // Only a mode change (applyMode with stagger) resets it.
    if (!scatterPhysics && allSettled && !this.settled) {
      this.settled = true;
      if (this.mode === "scatter") {
        // hand over from springs to free physics
        this.notes.forEach((n) => { n.vx = 0; n.vy = 0; n.vr = 0; });
      }
    }

    p.px = p.x;
    p.py = p.y;
  }

  private render() {
    const size = this.noteSize;
    const half = size / 2;
    const scrollOff =
      this.mode === "grid" ? this.scroll
      : this.mode === "scatter" ? this.scatterScroll
      : 0;

    // anchor the inspect metadata beside the held (scatter) or zoomed (grid) note
    const inspectI =
      this.mode === "scatter" && this.dragIndex != null
        ? this.dragIndex
        : this.mode === "grid" && this.gridZoom != null
          ? this.gridZoom
          : null;
    if (inspectI != null && this.cb.onHoldPos) {
      const n = this.notes[inspectI];
      const halfHeld = (size * n.s) / 2;
      const flip = n.x > this.vp.w * 0.62;
      this.cb.onHoldPos(
        flip ? n.x - halfHeld - 22 : n.x + halfHeld + 22,
        n.y - scrollOff,
        flip
      );
    }
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
      if (this.mode === "stack") {
        const top = this.stackTopIndex;
        if (i >= top && i <= top + 3) {
          // curl amount: manual peel progress on the top note, or distance
          // from rest for a note flying to / returning from the floor pile.
          // The actual bend is a rotateX on .note-paper driven by --peel.
          const dist = Math.hypot(n.tx - n.x, n.ty - n.y);
          let pr = Math.min(1, dist / (this.vp.h * 0.5));
          if (i === top && this.peelAccum > 0) {
            const manual = this.peelAccum / PEEL_DIST;
            pr = Math.max(pr, manual);
            // the grabbed edge rises a little as it peels
            y -= manual * size * 0.45;
            r += manual * (hash(this.drawings[i].id + ":pl") - 0.5) * 6;
          }
          if (i === top) {
            el.style.setProperty("--peelZ", this.peelZ.toFixed(1));
          }
          if (pr > 0.002) {
            el.style.setProperty("--peel", pr.toFixed(3));
            n.wx = Infinity; // force transform write while curling
          } else if (
            el.style.getPropertyValue("--peel") !== "0" &&
            el.style.getPropertyValue("--peel") !== ""
          ) {
            el.style.setProperty("--peel", "0");
          }
        }
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
      // timeline: depth-of-field blur, pass-behind fade, pendulum swing
      if (this.mode === "timeline") {
        if (Math.abs(n.blurT - n.wBlur) > 0.4) {
          el.style.setProperty("--blur", n.blurT.toFixed(1));
          n.wBlur = n.blurT;
        }
        if (Math.abs(n.opT - n.wOp) > 0.02) {
          el.style.opacity = n.opT >= 0.99 ? "" : n.opT.toFixed(2);
          n.wOp = n.opT;
        }
        if (Math.abs(n.fb - n.wFb) > 0.25) {
          el.style.setProperty("--fb", n.fb.toFixed(1));
          n.wFb = n.fb;
        }
      }
      const state =
        this.dragIndex === i
          ? "drag"
          : (this.mode === "grid" && i === this.gridTiltI) || n.hoverAmt > 0.35
            ? "hover"
            : "rest";
      if (state !== n.wState) {
        el.dataset.state = state;
        n.wState = state;
      }
      // 3D corner tilt on the hovered grid note
      if (this.mode === "grid" && i === this.gridTiltI) {
        el.style.setProperty("--tx", this.gridTiltX.toFixed(2));
        el.style.setProperty("--ty", this.gridTiltY.toFixed(2));
      } else {
        const tx = el.style.getPropertyValue("--tx");
        if (tx !== "" && tx !== "0") {
          el.style.setProperty("--tx", "0");
          el.style.setProperty("--ty", "0");
        }
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
