import { LunchDrawing, ViewMode } from "./types";
import {
  NoteTarget,
  Viewport,
  baseNoteSize,
  gridTargets,
  scatterTargets,
  stackTargets,
  timelineTargets,
  wallTargets,
  TimelineInfo,
} from "./layouts";
import { hash } from "./drawings";

type NoteSim = {
  x: number; y: number; r: number; s: number;
  vx: number; vy: number; vr: number;
  tx: number; ty: number; tr: number; ts: number;
  z: number;
  hidden: boolean;
  /** offscreen in a scrolling mode: skip simulation + paint (2,000-note scale) */
  culled: boolean;
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
  /** grid layout finished: content-space y per note index + total height */
  onGridLayout?: (ys: number[], contentHeight: number) => void;
  /** grid scroll frame update (drives the time strip) */
  onGridScroll?: (scroll: number, viewH: number, contentHeight: number) => void;
  /** grid click-to-zoom: zoomed note index + its on-screen size, null when put back */
  onGridZoom?: (index: number | null, sizePx: number) => void;
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
  scroll = 0; scrollTarget = 0; contentHeight = 0; gridCols = 5; // M default
  // touch momentum (grid + wall): px/s applied to the scroll target with
  // exponential decay, killed by any new input or hitting the ends
  flingVel = 0;
  gridTiltI = -1; gridTiltX = 0; gridTiltY = 0;
  gridZoom: number | null = null;
  // scatter: the desk is a virtual table taller than the viewport
  scatterScroll = 0; scatterScrollTarget = 0; scatterH = 0;
  // stack
  peeled = 0; peelAccum = 0; peelZ = 0; lastWheelAt = 0;
  stackDrag: { relX: number; startY: number; startAccum: number } | null = null;
  // timeline
  t = 0; tTarget = 0; tension = 0; tensionVel = 0; swing = 0;
  // wall (matches the Moments source): the note nearest the hand lifts and
  // rides the cursor inside the parted gap, swapping as the hand moves;
  // clicking pins it open at center and pauses the row drift
  wallZoom: number | null = null;
  wallOpen = false;
  wallDrift = 0;
  wallFocusHalf = 0;
  wallPoint = { x: 0, y: 0 }; // content space (y includes wall scroll)
  // the wall runs taller than the viewport; scroll down it for more rows
  wallScroll = 0; wallScrollTarget = 0; wallH = 0;
  private wallPrevX: number[] = [];

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
  private layer: HTMLElement | null = null;
  private wLayerT = "";

  setRoot(el: HTMLElement | null) {
    this.root = el;
    this.layer = el?.querySelector(".notes-layer") ?? null;
    this.root?.style.setProperty("--note-size", `${this.noteSize}px`);
  }

  constructor(drawings: LunchDrawing[], cb: EngineCallbacks = {}) {
    this.drawings = drawings;
    this.cb = cb;
    this.notes = drawings.map((d) => ({
      x: 0, y: 0, r: 0, s: 0.2, vx: 0, vy: 0, vr: 0,
      tx: 0, ty: 0, tr: 0, ts: 1, z: 0, hidden: false, culled: false, delay: 0, hoverAmt: 0,
      blurT: 0, opT: 1, fb: 0, fbv: 0,
      el: null,
      // wHidden starts true: CSS hides notes until the first render frame
      // explicitly reveals the visible ones
      wx: Infinity, wy: Infinity, wr: Infinity, ws: Infinity, wz: -1, wHidden: true, wState: "",
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
    this.wallZoom = null;
    this.setHover(null);
    this.notes.forEach((n) => {
      if (!n.el) return;
      n.el.style.setProperty("--peel", "0");
      n.el.style.setProperty("--peelZ", "0");
      n.el.style.setProperty("--blur", "0");
      n.el.style.setProperty("--fb", "0");
      n.el.style.opacity = "";
      if (n.el.dataset.zoomed) delete n.el.dataset.zoomed;
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
    if (mode === "wall") {
      this.wallDrift = 0;
      this.wallOpen = false;
      this.wallZoom = null; // nothing in focus until the cursor points at a note
      this.wallPrevX = [];
      this.wallScroll = this.wallScrollTarget = 0;
    }
    this.applyMode(mode, true);
    if (mode === "wall") this.setHover(this.wallZoom);
  }

  /** time strip: jump/scrub the grid to a content-space y */
  setGridScrollTarget(y: number) {
    if (this.mode !== "grid") return;
    if (this.gridZoom != null) this.onGridClick(null);
    this.scrollTarget = Math.max(0, Math.min(this.maxScroll, y));
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
      // labels render at a constant size regardless of note size (CSS
      // divides by the cell scale)
      this.root?.style.setProperty(
        "--grid-scale",
        (g.info.cell / this.noteSize).toFixed(4)
      );
      this.cb.onGridLayout?.(targets.map((t) => t.y), this.contentHeight);
      this.scrollTarget = Math.min(this.scrollTarget, this.maxScroll);
      // click-to-zoom: the zoomed note floats front and center
      if (this.gridZoom != null && targets[this.gridZoom]) {
        const base = this.noteSize;
        // phones: the open note should nearly fill the width
        const wFrac = this.vp.w < 640 ? 0.9 : 0.62;
        const big = Math.min((this.vp.h * 0.74) / base, (this.vp.w * wFrac) / base);
        targets[this.gridZoom] = {
          x: this.vp.w / 2,
          y: this.vp.h / 2 + this.scroll,
          r: 0,
          s: big,
          z: 9000,
        };
        this.cb.onGridZoom?.(this.gridZoom, big * base);
      } else {
        this.cb.onGridZoom?.(null, 0);
      }
      // data-zoomed lets CSS hide the scaled-up label and deepen the shadow
      this.notes.forEach((n, idx) => {
        if (!n.el) return;
        if (idx === this.gridZoom) n.el.dataset.zoomed = "true";
        else if (n.el.dataset.zoomed) delete n.el.dataset.zoomed;
      });
    } else if (mode === "stack") {
      targets = stackTargets(this.drawings, this.vp, this.peeled);
      this.updateFocus(this.stackTopIndex);
    } else if (mode === "wall") {
      const wl = wallTargets(this.drawings, this.vp, this.wallDrift);
      targets = wl.targets;
      this.wallH = wl.info.height;
      this.wallScrollTarget = Math.min(this.wallScrollTarget, this.maxWallScroll);
      this.updateFocus(this.wallZoom); // per-frame follow logic lives in tick
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

  get maxWallScroll() {
    return Math.max(0, this.wallH - this.vp.h);
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

  /** touch release momentum: continue scrolling at v px/s with decay */
  fling(v: number) {
    if (this.mode === "grid" || this.mode === "wall") this.flingVel = v;
  }

  onWheel(dy: number) {
    this.flingVel = 0;
    if (this.mode === "scatter") {
      // scroll down the virtual table to reach more notes
      this.scatterScrollTarget = Math.max(
        0,
        Math.min(this.maxScatterScroll, this.scatterScrollTarget + dy)
      );
    } else if (this.mode === "grid") {
      if (this.gridZoom != null) this.onGridClick(null); // scrolling puts it back
      this.scrollTarget = Math.max(0, Math.min(this.maxScroll, this.scrollTarget + dy));
    } else if (this.mode === "wall") {
      // scrolling hands a pinned moment back, then travels down the wall
      if (this.wallOpen) this.wallOpen = false;
      this.wallScrollTarget = Math.max(
        0,
        Math.min(this.maxWallScroll, this.wallScrollTarget + dy)
      );
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
    // while a note is open, any click — the note, another note, or the
    // desk — just puts it back; the first click never opens a new one
    this.gridZoom = this.gridZoom != null ? null : i;
    this.applyMode("grid", false);
    this.setHover(this.gridZoom);
  }

  /**
   * wall: clicking pins the moment riding the hand open at center; any
   * click while one is open (or Escape → null) hands it back to the cursor.
   */
  onWallClick(i: number | null) {
    if (this.mode !== "wall") return;
    if (this.wallOpen) {
      this.wallOpen = false;
      return;
    }
    if (i != null && this.wallZoom != null) this.wallOpen = true;
  }

  /** wall: arrow keys step through the moments while one is pinned open */
  wallStep(dir: number) {
    if (this.mode !== "wall" || !this.wallOpen || this.wallZoom == null) return;
    const n = this.drawings.length;
    this.wallZoom = (this.wallZoom + dir + n) % n;
    this.updateFocus(this.wallZoom);
    this.setHover(this.wallZoom);
  }

  /** role: index of note pressed, or null for empty surface */
  onPointerDown(x: number, y: number, noteIndex: number | null) {
    this.flingVel = 0; // finger down stops any glide, iOS-style
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
    this.setHover(
      this.mode === "grid" ? this.gridZoom
      : this.mode === "wall" ? this.wallZoom
      : null
    );
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
    // wall: a pinned moment keeps its label; an unpinned focus releases
    this.setHover(this.mode === "wall" && this.wallOpen ? this.wallZoom : null);
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

    // touch momentum: glide the scroll target with exponential decay
    if (this.flingVel !== 0) {
      const dv = this.flingVel * dt;
      if (mode === "grid") {
        const nt = this.scrollTarget + dv;
        this.scrollTarget = Math.max(0, Math.min(this.maxScroll, nt));
        if (nt <= 0 || nt >= this.maxScroll) this.flingVel = 0;
      } else if (mode === "wall") {
        const nt = this.wallScrollTarget + dv;
        this.wallScrollTarget = Math.max(0, Math.min(this.maxWallScroll, nt));
        if (nt <= 0 || nt >= this.maxWallScroll) this.flingVel = 0;
      } else {
        this.flingVel = 0;
      }
      this.flingVel *= Math.exp(-dt * 2.1);
      if (Math.abs(this.flingVel) < 15) this.flingVel = 0;
    }

    // smooth internal scroll positions
    if (mode === "scatter") {
      this.scatterScroll +=
        (this.scatterScrollTarget - this.scatterScroll) * Math.min(1, dt * 10);
    }
    if (mode === "grid") {
      this.scroll += (this.scrollTarget - this.scroll) * Math.min(1, dt * 10);
      // scroll shifts the whole grid: targets stay in content space,
      // render subtracts scroll (no per-note recompute needed)
      this.cb.onGridScroll?.(this.scroll, this.vp.h, this.contentHeight);
    } else if (mode === "timeline") {
      const prevT = this.t;
      this.t += (this.tTarget - this.t) * Math.min(1, dt * 7);
      const tVel = (this.t - prevT) / Math.max(dt, 0.001);
      // rope tension is a spring so it bounces after a scroll stops
      const tensionGoal = Math.min(1, Math.abs(tVel) / 4);
      this.tensionVel += ((tensionGoal - this.tension) * 26 - this.tensionVel * 6) * dt;
      this.tension = Math.max(-0.05, Math.min(1.15, this.tension + this.tensionVel * dt));
      // pulling the string swings the hanging notes front/back (rotateX);
      // each note is an underdamped pendulum chasing the swing target.
      // High gain + low damping: starting and stopping a scroll throws the
      // notes into a big, clearly visible swing that rings down afterward.
      this.swing = Math.max(-52, Math.min(52, tVel * 18));
      const tl = timelineTargets(this.drawings, this.vp, this.t);
      tl.targets.forEach((tt, i) => {
        const note = this.notes[i];
        note.tx = tt.x; note.ty = tt.y; note.tr = tt.r; note.ts = tt.s;
        note.z = tt.z; note.hidden = !!tt.hidden;
        note.blurT = tt.blur ?? 0;
        note.opT = tt.opacity ?? 1;
        if (!note.hidden) {
          const phase = 0.75 + hash(this.drawings[i].id + ":ph") * 0.5;
          note.fbv += ((this.swing * phase - note.fb) * 30 - note.fbv * 2.0) * dt;
          note.fb += note.fbv * dt;
        }
      });
      this.updateFocus(tl.info.focusIndex);
      this.cb.onThread?.(tl.info.anchors, this.tension, this.vp);
    }

    // wall: the rows drift sideways forever (pausing while a moment is
    // pinned open); retarget every note each frame
    if (mode === "wall") {
      if (!this.wallOpen) this.wallDrift += dt * 16;
      this.wallScroll +=
        (this.wallScrollTarget - this.wallScroll) * Math.min(1, dt * 10);
      const wl = wallTargets(this.drawings, this.vp, this.wallDrift);
      this.wallH = wl.info.height;
      const halfRing = wl.info.ringW / 2;
      const firstPass = this.wallPrevX.length !== wl.targets.length;
      wl.targets.forEach((tt, i) => {
        const note = this.notes[i];
        const prevX = firstPass ? tt.x : this.wallPrevX[i];
        this.wallPrevX[i] = tt.x;
        if (i === this.wallZoom) return; // riding the hand, not the ring
        // ring wrap: the target teleported a full ring width offscreen —
        // carry the note across with it so the spring never drags it back
        if (Math.abs(tt.x - prevX) > halfRing) {
          note.x += tt.x - prevX;
        }
        note.tx = tt.x; note.ty = tt.y; note.tr = tt.r; note.ts = tt.s;
        note.z = tt.z;
      });

      // the gap and the featured moment exist only while the cursor is on
      // the wall: no pointer -> no focus, no parting (Justin's spec).
      // Note targets are in wall (content) space, so the pointer converts
      // by the current scroll.
      const size0 = this.noteSize;
      const pt = this.pointer;
      const hasPointer = pt.x > -9000;
      const fx = hasPointer ? pt.x : -1e6;
      const fy = hasPointer ? pt.y + this.wallScroll : -1e6;
      this.wallPoint.x = fx;
      this.wallPoint.y = fy;

      // focus follows the pointer: the nearest note within reach takes it,
      // and it releases when the cursor leaves the wall (never while pinned)
      if (!this.wallOpen) {
        let best = -1;
        let bestD = Infinity;
        if (hasPointer) {
          for (let i = 0; i < wl.targets.length; i++) {
            const d = Math.hypot(wl.targets[i].x - fx, wl.targets[i].y - fy);
            if (d < bestD) { bestD = d; best = i; }
          }
        }
        if (best >= 0 && bestD < size0 * 2.0) {
          if (best !== this.wallZoom) {
            this.wallZoom = best;
            this.updateFocus(best);
            this.setHover(best);
          }
        } else if (this.wallZoom != null) {
          this.wallZoom = null;
          this.updateFocus(null);
          this.setHover(null);
        }
      }

      // the featured note's target: on the hand, or pinned at center
      const zi = this.wallZoom;
      if (zi != null && this.notes[zi]) {
        const big = Math.min((this.vp.h * 0.52) / size0, (this.vp.w * 0.4) / size0);
        this.wallFocusHalf = (big * size0) / 2;
        const nz = this.notes[zi];
        if (this.wallOpen) {
          nz.tx = this.vp.w / 2;
          nz.ty = this.vp.h * 0.45 + this.wallScroll;
          nz.tr = 0;
          nz.ts = big;
        } else {
          nz.tx = fx;
          nz.ty = fy;
          nz.tr = 0;
          nz.ts = Math.min(2.3, big * 0.72);
        }
        nz.z = 9000;
      }
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

    // scroll-mode culling: a note whose rest position is more than a screen
    // outside the viewport neither simulates nor paints
    const cullScroll =
      mode === "wall" ? this.wallScroll
      : mode === "grid" ? this.scroll
      : mode === "scatter" && this.settled ? this.scatterScroll
      : null;
    // narrower cull margin on phones: fewer live notes = less memory and
    // fewer composited layers
    const cullMargin = this.vp.h * (this.vp.w < 640 ? 0.5 : 1);
    const cullTop = cullScroll != null ? cullScroll - cullMargin : 0;
    const cullBot = cullScroll != null ? cullScroll + this.vp.h + cullMargin : 0;

    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      const cullY = mode === "scatter" ? n.y : n.ty; // scatter roams free
      n.culled =
        cullScroll != null &&
        (cullY < cullTop || cullY > cullBot) &&
        this.dragIndex !== i &&
        !(mode === "wall" && i === this.wallZoom);
      if (n.hidden || n.culled) {
        // teleport while invisible: when this note is revealed later (e.g.
        // rising through the stack as notes peel off), it must already be
        // resting in place — never seen flying in from across the desk.
        // (scatter keeps culled notes where they lie — physics owns them)
        if (n.hidden || mode !== "scatter") {
          n.x = n.tx; n.y = n.ty; n.r = n.tr; n.s = n.ts;
          n.vx = 0; n.vy = 0; n.vr = 0;
          n.delay = 0;
        }
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
        // the wall parts wherever the cursor goes: rest targets stay fixed,
        // and a radial displacement field pushes nearby notes aside. The
        // springs chase the displaced target, so the gap opens and closes
        // organically as the hand moves.
        let tx = n.tx, ty = n.ty, tr = n.tr, ts = n.ts;
        if (mode === "wall" && i !== this.wallZoom) {
          // the wall parts around the hand. Field shape matches the Moments
          // source: gap radius l, reach 1.3·l, push l·(1−d/c)², plus a rim
          // of slightly-raised notes around the opening.
          const l = size * 2.2;
          const c = l * 1.3;
          const dx = n.tx - this.wallPoint.x;
          const dy = n.ty - this.wallPoint.y;
          const d = Math.hypot(dx, dy);
          if (d < c) {
            const f = (1 - d / c) ** 2;
            const ux = d > 0.001 ? dx / d : 1;
            const uy = d > 0.001 ? dy / d : 0;
            tx += ux * l * f;
            ty += uy * l * f;
            tr += ux * f * 11; // notes lean away as they slide aside
            // the parting lifts nearby notes slightly (deeper shadow)
            n.hoverAmt = Math.min(1, Math.max(n.hoverAmt, f * 0.9));
          }
          if (d > l * 0.55 && d < l * 1.05) {
            ts *=
              1 +
              0.06 *
                smoothstep(l * 0.55, l * 0.8, d) *
                (1 - smoothstep(l * 0.85, l * 1.05, d));
          }
          // while a moment is pinned open the rows also keep clear of it
          if (this.wallOpen) {
            const dx2 = n.tx - this.vp.w / 2;
            const dy2 = n.ty - (this.vp.h * 0.45 + this.wallScroll);
            const d2 = Math.hypot(dx2, dy2);
            const R2 = this.wallFocusHalf + size * 0.8;
            if (d2 < R2) {
              const f2 = (1 - d2 / R2) ** 1.5;
              const ux2 = d2 > 0.001 ? dx2 / d2 : 1;
              const uy2 = d2 > 0.001 ? dy2 / d2 : 0;
              tx += ux2 * f2 * size * 1.5;
              ty += uy2 * f2 * size * 1.5;
            }
          }
        }
        // spring toward (possibly displaced) target
        const st = 170, dp = 20;
        n.vx += (tx - n.x) * st * dt - n.vx * dp * dt;
        n.vy += (ty - n.y) * st * dt - n.vy * dp * dt;
        n.vr += (tr - n.r) * st * dt - n.vr * dp * dt;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.r += n.vr * dt;
        n.s += (ts - n.s) * Math.min(1, dt * 9);
        n.hoverAmt = Math.max(0, n.hoverAmt - dt * 3);
        const still =
          Math.abs(tx - n.x) < 0.5 && Math.abs(ty - n.y) < 0.5 &&
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
        if (a.hidden || a.culled) continue;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp < 30 && this.dragIndex !== i) continue;
        const strength = this.dragIndex === i ? 1 : Math.min(1, sp / 260);
        for (let j = 0; j < this.notes.length; j++) {
          if (i === j) continue;
          const b = this.notes[j];
          if (b.hidden || b.culled) continue;
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
        if (n.hidden || n.culled) continue;
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
      : this.mode === "wall" ? this.wallScroll
      : 0;

    // scrolling moves the whole layer as ONE composited transform; note
    // elements keep content-space positions and only rewrite when they
    // actually move. (Per-note scroll writes made mobile scrolling crawl.)
    const layerT = scrollOff > 0.01 ? `translate3d(0px,${-scrollOff.toFixed(2)}px,0px)` : "";
    if (this.layer && layerT !== this.wLayerT) {
      this.layer.style.transform = layerT;
      this.wLayerT = layerT;
    }

    // anchor the inspect metadata beside the held (scatter) or zoomed (grid) note
    const inspectI =
      this.mode === "scatter" && this.dragIndex != null
        ? this.dragIndex
        : this.mode === "grid" && this.gridZoom != null
          ? this.gridZoom
          : this.mode === "wall" && this.wallZoom != null
            ? this.wallZoom
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
      // display:none (not visibility) so offscreen notes hold no compositor
      // layer and their lazy images never fetch — critical on iOS Safari
      const invisible = n.hidden || n.culled;
      if (invisible !== n.wHidden) {
        // explicit "block": the stylesheet hides notes by default (pre-
        // engine image-load stampede protection), so "" would re-hide
        el.style.display = invisible ? "none" : "block";
        n.wHidden = invisible;
      }
      if (invisible) continue;
      let x = n.x - half;
      let y = n.y - half; // content space: the layer transform applies scroll
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

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
