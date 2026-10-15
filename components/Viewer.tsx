"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getDrawings } from "@/lib/drawings";
import { syncThemeColor } from "@/lib/theme";
import { LunchDrawing, ViewMode } from "@/lib/types";
import { NotesEngine } from "@/lib/engine";
import { monthKey, formatMonth, formatShortYear } from "@/lib/dates";
import { ageGradeLabel } from "@/lib/kids";
import { NoteCard } from "./NoteCard";
import { ModeSelector } from "./ModeSelector";
import { DeskSurface } from "./DeskSurface";
import { MetadataPanel, HoldMetadata } from "./MetadataPanel";
import { IntroNote } from "./IntroNote";
import { BackgroundPicker } from "./BackgroundPicker";
import { TimeStrip, TimeStripHandle } from "./TimeStrip";
import { WallRail, WallRailHandle } from "./WallRail";
import { CornerButtons } from "./CornerButtons";
import { SubjectPicker } from "./SubjectPicker";
import {
  applyFilter,
  EMPTY_FILTER,
  Filter,
  HIDDEN_TAGS,
  labelForSlug,
  slugify,
} from "@/lib/taxonomy";

// when "Open the Lunchbox" comes before the preload finishes, wait at most this
// long before the post-its fly in anyway (they fill in as images arrive)
const REVEAL_GRACE_MS = 800;

/** frosted caption under an opened note (grid zoom, wall pinned moment) */
function CaptionPill({
  d,
  num,
  top,
  onPick,
}: {
  d: LunchDrawing;
  num: number | undefined;
  top: string;
  /** a subject chip was tapped: filter the desk to that label */
  onPick: (slug: string) => void;
}) {
  return (
    <div className="zoom-pill" key={d.id} style={{ top }}>
      {d.title && <div className="zp-title">{d.title}</div>}
      <div className="zp-row">
        {d.child && (
          <span className={`meta-child child-bg-${d.child.toLowerCase()}`}>
            {d.child}
            {ageGradeLabel(d.child, d.date) && (
              <span className="meta-age"> · {ageGradeLabel(d.child, d.date)}</span>
            )}
          </span>
        )}
        <span className="zp-date">
          {formatShortYear(d.date)}
          <span className="zp-sep">·</span>
          <span className="zp-num">drawing #{num?.toLocaleString()}</span>
        </span>
        <LabelChips d={d} onPick={onPick} />
      </div>
    </div>
  );
}

/**
 * The drawing's labels as links into the subject filter: the series first
 * (Kirby, Octonauts…), then its subject and occasion tags. Umbrella tags and
 * the franchise tags the series field now covers stay out of the way.
 */
export function LabelChips({ d, onPick }: { d: LunchDrawing; onPick: (slug: string) => void }) {
  const tags = (d.tags ?? []).filter((t) => !HIDDEN_TAGS.includes(t) && t !== d.series);
  return (
    <>
      {d.series && (
        <button
          type="button"
          className="meta-tag meta-tag-link meta-tag-series"
          onClick={() => onPick(slugify(d.series as string))}
        >
          {d.series}
        </button>
      )}
      {tags.map((t) => (
        <button
          type="button"
          key={t}
          className="meta-tag meta-tag-link"
          onClick={() => onPick(slugify(t))}
        >
          {t}
        </button>
      ))}
    </>
  );
}

/** phone width, matching the layouts' `vp.w < 640` (false on the server) */
const PHONE_MQ = "(max-width: 639px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isPhoneNow = () => window.matchMedia(PHONE_MQ).matches;
const isPhoneOnServer = () => false;

// the query string is read once per search value (useSyncExternalStore needs a
// stable snapshot); the server snapshot is "nothing chosen"
const noSubscribe = () => () => {};
let urlFilterCache: { search: string; value: Filter } | null = null;
function readUrlFilter(): Filter {
  const search = window.location.search;
  if (urlFilterCache?.search === search) return urlFilterCache.value;
  const p = new URLSearchParams(search);
  const tag = p.get("tag");
  const child = (p.get("child") ?? "").toLowerCase();
  const value: Filter = {
    tag: tag ? slugify(tag) : null,
    child: child === "chase" ? "Chase" : child === "vinny" ? "Vinny" : null,
  };
  urlFilterCache = { search, value };
  return value;
}
const emptyFilterOnServer = () => EMPTY_FILTER;
/** dev hook for screenshots: ?picker=1 opens the subject card on load */
const readPickerParam = () =>
  process.env.NODE_ENV === "development" &&
  new URLSearchParams(window.location.search).get("picker") === "1";
const pickerClosedOnServer = () => false;

/** ?count=N keeps a recent slice (testing); default is the whole archive */
function getCount(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const c = Number(new URLSearchParams(window.location.search).get("count"));
  return Number.isFinite(c) && c > 0 ? c : undefined;
}

export function Viewer() {
  const [count] = useState(getCount);
  const all = useMemo(() => getDrawings(count), [count]);
  // the subject filter (a tag or series slug, and/or a child): the desk shows
  // the matching subset; everything that counts drawings globally uses `all`.
  // It starts from the query string (read after hydration, like the phone
  // default) and a choice made on the page overrides it from then on.
  const urlFilter = useSyncExternalStore(noSubscribe, readUrlFilter, emptyFilterOnServer);
  const [chosenFilter, setChosenFilter] = useState<Filter | null>(null);
  const filter = chosenFilter ?? urlFilter;
  const drawings = useMemo(() => applyFilter(all, filter), [all, filter]);
  const filterLabel = useMemo(
    () => (filter.tag ? labelForSlug(all, filter.tag) : null),
    [all, filter.tag]
  );
  const pickerFromUrl = useSyncExternalStore(noSubscribe, readPickerParam, pickerClosedOnServer);
  const [pickerChoice, setPickerChoice] = useState<boolean | null>(null);
  const pickerOpen = pickerChoice ?? pickerFromUrl;
  const setPickerOpen = setPickerChoice;
  // running number in the whole archive (oldest = #1), stable under filters
  const numById = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((d, i) => m.set(d.id, i + 1));
    return m;
  }, [all]);
  const [mode, setMode] = useState<ViewMode>("grid");
  // grid note size: the default is M on desktop and S (three across) on
  // phones until the viewer picks one. The server renders M; React swaps in
  // the phone default right after hydration, under the welcome note.
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, isPhoneOnServer);
  const [gridColsChoice, setGridColsChoice] = useState<number | null>(null);
  const gridCols = gridColsChoice ?? (isPhone ? 7 : 5);
  const [focus, setFocus] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  // grid click-to-zoom: index + on-screen size of the open note (drives the caption pill)
  const [gridZoom, setGridZoomState] = useState<{ idx: number; size: number } | null>(null);
  // wall: the pinned-open moment gets the same caption pill
  const [wallOpen, setWallOpenState] = useState<{ idx: number; size: number } | null>(null);
  // mobile chrome (header + S/M/L): hides on scroll down, returns on scroll up
  const chromeRef = useRef({ prev: 0, acc: 0, off: false });
  const [loaded, setLoaded] = useState(false);

  const engineRef = useRef<NotesEngine | null>(null);
  // the post-its fly in when the welcome note closes, not while it's being read
  const introClosed = useRef<{ done: boolean; wake: (() => void) | null }>({
    done: false,
    wake: null,
  });
  const onIntroClose = useCallback(() => {
    introClosed.current.done = true;
    introClosed.current.wake?.();
  }, []);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<TimeStripHandle | null>(null);
  const gridLayoutRef = useRef<{ ys: number[]; contentH: number } | null>(null);
  const wallRailRef = useRef<WallRailHandle | null>(null);
  const wallLayoutRef = useRef<{ ys: number[]; h: number } | null>(null);
  const holdTipRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const attach = useMemo(
    () => (i: number, el: HTMLDivElement | null) => engineRef.current?.attach(i, el),
    []
  );

  // month markers for the timeline thread
  const monthMarks = useMemo(() => {
    const marks: { i: number; label: string }[] = [];
    let last = "";
    drawings.forEach((d, i) => {
      const k = monthKey(d.date);
      if (k !== last) {
        marks.push({ i, label: formatMonth(d.date) });
        last = k;
      }
    });
    return marks;
  }, [drawings]);

  useEffect(() => {
    const eng = new NotesEngine(drawings, {
      onFocus: (i) => setFocus(i),
      onHover: (i) => setHeld(i),
      onHoldPos: (x, y, flip) => {
        const el = holdTipRef.current;
        if (!el) return;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
      },
      onThread: (anchors) => {
        const byI = new Map(anchors.map((a) => [a.i, a]));
        monthMarks.forEach((m, k) => {
          const el = monthRefs.current[k];
          if (!el) return;
          const a = byI.get(m.i);
          if (a) {
            // month labels sit to the left of the near-vertical rope
            el.style.transform = `translate(${a.x - 130}px, ${a.y - 12}px)`;
            el.style.opacity = "1";
          } else {
            el.style.opacity = "0";
          }
        });
      },
      onGridLayout: (ys, contentH) => {
        gridLayoutRef.current = { ys, contentH };
        stripRef.current?.layout(ys, contentH);
      },
      onGridScroll: (scroll, viewH, contentH) => {
        stripRef.current?.sync(scroll, viewH, contentH);
        // phones: scrolling down slides the header + S/M/L away (the mode nav
        // docks at the top); any scroll up brings them back. Safari's chrome
        // tint follows the header.
        if (window.innerWidth < 640) {
          const cr = chromeRef.current;
          const d = scroll - cr.prev;
          cr.prev = scroll;
          // accumulate one direction at a time so tiny jitter can't flicker it
          if (d > 0) cr.acc = Math.max(0, cr.acc) + d;
          else if (d < 0) cr.acc = Math.min(0, cr.acc) + d;
          const hide = !cr.off && scroll > 70 && cr.acc > 14;
          const show = cr.off && (cr.acc < -14 || scroll < 40);
          if (hide || show) {
            cr.off = hide;
            const root = document.documentElement;
            root.dataset.chrome = hide ? "off" : "on";
            root.dataset.headerOff = hide ? "1" : "0";
            syncThemeColor();
          }
        }
      },
      onGridZoom: (i, sizePx) =>
        setGridZoomState(i == null ? null : { idx: i, size: sizePx }),
      onWallOpen: (i, sizePx) =>
        setWallOpenState(i == null ? null : { idx: i, size: sizePx }),
      onWallLayout: (ys, h) => {
        wallLayoutRef.current = { ys, h };
        wallRailRef.current?.layout(ys, h);
      },
      onWallScroll: (scroll, viewH, h) => {
        wallRailRef.current?.sync(scroll, viewH, h);
      },
    });
    engineRef.current = eng;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __eng?: NotesEngine }).__eng = eng;
    }
    eng.setRoot(surfaceRef.current);
    // if the engine is recreated mid-session (fast refresh, strict mode),
    // adopt the mode AND grid size the UI is already showing — the engine's
    // internal defaults must never disagree with the controls
    eng.setGridCols(gridCols);
    if (mode !== "scatter") eng.setMode(mode);
    // NoteCard ref callbacks fired before the engine existed — attach now
    surfaceRef.current
      ?.querySelectorAll<HTMLDivElement>("[data-note-i]")
      .forEach((el) => {
        // a filter change rebuilds the engine around the same DOM nodes: hide
        // every note again so a survivor of the old layout can't sit on screen
        // at its old spot until the new render reaches it (the engine writes
        // display only when its own bookkeeping changes)
        el.style.display = "none";
        eng.attach(Number(el.dataset.noteI), el);
      });

    // ResizeObserver instead of window resize: the page can be laid out at
    // zero size briefly (embedded previews, background tabs) with no resize
    // event ever firing afterward.
    let firstMeasure = true;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width < 10 || r.height < 10) return;
      eng.setViewport({ w: r.width, h: r.height }, firstMeasure);
      firstMeasure = false;
    });
    if (surfaceRef.current) ro.observe(surfaceRef.current);

    // preload behind the welcome note (PRD §16): thumbnails for the newest
    // notes, plus, on desktop, the full-size images the default grid (size M)
    // shows on its first screen. Phones open on S, which shows thumbnails.
    // Grid and Wall show the NEWEST drawings first.
    const phone = window.innerWidth < 640;
    const preload = [
      ...drawings.slice(-160).map((d) => d.thumbSrc),
      ...(phone ? [] : drawings.slice(-20).map((d) => d.imageSrc)),
    ].map(
      (src) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = src;
        })
    );
    const ready = Promise.race([
      Promise.allSettled(preload),
      new Promise((res) => setTimeout(res, 4500)),
    ]);
    const dismissed = new Promise<void>((res) => {
      if (introClosed.current.done) res();
      else introClosed.current.wake = res;
    });
    let cancelled = false;
    dismissed
      .then(() =>
        Promise.race([ready, new Promise((res) => setTimeout(res, REVEAL_GRACE_MS))])
      )
      .then(() => {
        if (cancelled) return;
        setLoaded(true);
        eng.reveal();
        eng.start();
      });

    // wheel must be non-passive so the page never scrolls
    const surface = surfaceRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : 1;
      eng.onWheel(e.deltaY * k);
    };
    surface?.addEventListener("wheel", onWheel, { passive: false });

    // when the tab was hidden, rAF was paused mid-transition; finish those
    // moves instantly on return instead of resuming as one big group glide
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
      } else if (performance.now() - hiddenAt > 1200) {
        eng.finishTransitions();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const onKey = (e: KeyboardEvent) => {
      // the subject picker's search field owns its own keys
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") {
        // put an opened note back (grid zoom / wall moment)
        eng.onGridClick(null);
        eng.onWallClick(null);
        return;
      }
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
      if (!fwd && !back) return;
      if (eng.mode === "stack") eng.onWheel(fwd ? 360 : -60);
      else if (eng.mode === "timeline") eng.onWheel(fwd ? 260 : -260);
      else if (eng.mode === "grid") eng.onWheel(fwd ? 160 : -160);
      else if (eng.mode === "wall") {
        if (eng.wallOpen) eng.wallStep(fwd ? 1 : -1);
        else eng.onWheel(fwd ? 160 : -160);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      eng.stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
      surface?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings]);

  // the grid scroll resets (mode change, re-deal): the mobile chrome comes home with it
  const resetChrome = () => {
    const cr = chromeRef.current;
    cr.off = false;
    cr.prev = 0;
    cr.acc = 0;
    const root = document.documentElement;
    root.dataset.chrome = "on";
    root.dataset.headerOff = "0";
    syncThemeColor();
  };

  const changeMode = (m: ViewMode) => {
    setMode(m);
    setHeld(null);
    setWallOpenState(null);
    engineRef.current?.setMode(m);
    resetChrome();
  };

  // a new filter re-deals the desk (the engine effect rebuilds on `drawings`):
  // drop every index-based interaction state first, since the indices move
  const setFilter = useCallback((next: Filter) => {
    setChosenFilter((cur) =>
      cur && cur.tag === next.tag && cur.child === next.child
        ? cur
        : { tag: next.tag, child: next.child }
    );
    setGridZoomState(null);
    setWallOpenState(null);
    setHeld(null);
    setFocus(null);
    resetChrome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the filter lives in the query string (?tag=ocean&child=vinny) so a filtered
  // desk can be shared: write a choice back once one has been made
  useEffect(() => {
    if (!chosenFilter) return;
    const p = new URLSearchParams(window.location.search);
    if (filter.tag) p.set("tag", filter.tag);
    else p.delete("tag");
    if (filter.child) p.set("child", filter.child.toLowerCase());
    else p.delete("child");
    const q = p.toString();
    const next = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
    const cur = window.location.pathname + window.location.search + window.location.hash;
    if (next !== cur) history.replaceState(null, "", next);
  }, [chosenFilter, filter]);

  // a label chip (caption pill, stack/timeline caption) narrows to that label
  const pickLabel = useCallback(
    (slug: string) => {
      setFilter({ tag: slug, child: filter.child });
      setPickerOpen(false);
    },
    [filter.child, setFilter]
  );

  const changeGridCols = (cols: number) => {
    setGridColsChoice(cols);
    engineRef.current?.setGridCols(cols);
  };

  // keep the engine on the size the controls show (the phone default lands
  // one render after hydration)
  useEffect(() => {
    engineRef.current?.setGridCols(gridCols);
  }, [gridCols]);

  // phones have no Scatter tab (its hover/toss/hold play fights touch
  // scrolling): if the window narrows to phone width mid-scatter, go to grid
  useEffect(() => {
    if (mode !== "scatter") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const leave = () => {
      if (mq.matches) changeMode("grid");
    };
    leave();
    mq.addEventListener("change", leave);
    return () => mq.removeEventListener("change", leave);
  }, [mode]);

  // first paint: put Safari's chrome in step with the header/desk
  useEffect(() => {
    syncThemeColor();
  }, []);

  // a pinned wall moment outranks the year rail if they overlap
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "wall" && wallOpen) root.dataset.wallOpen = "1";
    else delete root.dataset.wallOpen;
  }, [wallOpen, mode]);

  // shareable links: the open drawing's number lives in the URL hash.
  // Only clear a hash we wrote — the arrival hash must survive until the
  // open-from-hash effect below has consumed it.
  const syncedNum = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const d = gridZoom ? drawings[gridZoom.idx] : null;
    const num = (d && numById.get(d.id)) || null;
    if (num) {
      history.replaceState(null, "", `#${num}`);
      syncedNum.current = num;
    } else if (syncedNum.current != null) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      syncedNum.current = null;
    }
  }, [gridZoom, drawings, numById]);

  // arriving with #1514 in the URL opens that drawing once the grid is up.
  // The number is the archive number; if the current filter hides that
  // drawing, the filter yields (the re-deal re-runs this effect).
  const openedFromHash = useRef(false);
  useEffect(() => {
    if (!loaded || openedFromHash.current) return;
    const m = /^#(\d{1,4})$/.exec(window.location.hash);
    if (!m) {
      openedFromHash.current = true;
      return;
    }
    const target = all[Number(m[1]) - 1];
    if (!target) {
      openedFromHash.current = true;
      return;
    }
    const idx = drawings.indexOf(target);
    if (idx < 0) {
      // the shared drawing is outside the current filter: the filter yields and
      // the re-deal brings this effect back around with the full set
      const t = setTimeout(() => setFilter(EMPTY_FILTER), 0);
      return () => clearTimeout(t);
    }
    openedFromHash.current = true;
    let tries = 0;
    const attempt = () => {
      const eng = engineRef.current;
      if (!eng || !drawings[idx] || mode !== "grid") return;
      const ys = gridLayoutRef.current?.ys;
      // the grid may not be measurable yet (throttled/hidden tab) — wait it out
      if ((!ys || ys[idx] == null || eng.maxScroll <= 0) && tries++ < 8) {
        setTimeout(attempt, 300);
        return;
      }
      if (ys && ys[idx] != null) {
        // jump (not glide) so the zoom target lands on the right scroll
        eng.setGridScrollTarget(Math.max(0, ys[idx] - window.innerHeight * 0.45));
        eng.scroll = eng.scrollTarget;
      }
      eng.onGridClick(idx);
    };
    const t = setTimeout(attempt, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, drawings]);

  // full-res images near the focused note in stack/timeline
  const featured = useMemo(() => {
    const s = new Set<string>();
    if ((mode === "stack" || mode === "timeline") && focus != null) {
      for (let k = focus - 3; k <= focus + 2; k++) {
        if (drawings[k]) s.add(drawings[k].id);
      }
    }
    // wall: only the opened moment needs the full-resolution image
    if (mode === "wall" && focus != null && drawings[focus]) {
      s.add(drawings[focus].id);
    }
    // a note held up close (scatter hold, wall follow) sharpens too
    if (held != null && drawings[held]) {
      s.add(drawings[held].id);
    }
    return s;
  }, [mode, focus, held, drawings]);

  const touchDrag = useRef<{
    lastY: number;
    lastT: number;
    vel: number; // scroll px/s, exponentially smoothed
    pointerId: number;
  } | null>(null);
  const press = useRef<{ x: number; y: number; t: number; idx: number | null } | null>(null);
  // two-finger pinch on the grid steps the note size (S <-> M <-> L)
  const pinch = useRef<{
    pts: Map<number, { x: number; y: number }>;
    startDist: number | null;
  }>({ pts: new Map(), startDist: null });

  return (
    <>
      <div
        ref={surfaceRef}
        className="viewer"
        data-mode={mode}
        onPointerDown={(e) => {
          const eng = engineRef.current;
          if (!eng) return;
          // presses on UI controls must not start desk interactions or capture the pointer
          if ((e.target as HTMLElement).closest("button, a, .nav-stack, .time-strip, .wall-rail, .title-slip, .story-backdrop, .bg-picker, .corner-utils, .zoom-pill")) return;
          const noteEl = (e.target as HTMLElement).closest("[data-note-i]");
          const idx = noteEl ? Number(noteEl.getAttribute("data-note-i")) : null;
          eng.onPointerDown(e.clientX, e.clientY, idx);
          press.current = { x: e.clientX, y: e.clientY, t: performance.now(), idx };
          if (e.pointerType !== "mouse" && mode !== "scatter" && !eng.stackDragging) {
            touchDrag.current = { lastY: e.clientY, lastT: e.timeStamp, vel: 0, pointerId: e.pointerId };
          }
          if (e.pointerType !== "mouse") {
            const pn = pinch.current;
            pn.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pn.pts.size === 2) {
              const [p1, p2] = [...pn.pts.values()];
              pn.startDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
              touchDrag.current = null; // a pinch is not a scroll
              press.current = null; // ...and not a click
            }
          }
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const eng = engineRef.current;
          if (!eng) return;
          // hovering the wall rail shouldn't pick up notes underneath it
          if ((e.target as HTMLElement).closest?.(".wall-rail")) {
            eng.pointerLeft();
            return;
          }
          // active pinch: spread = bigger notes, squeeze = smaller (grid only)
          const pn = pinch.current;
          if (pn.pts.has(e.pointerId)) {
            pn.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }
          if (pn.pts.size >= 2 && pn.startDist != null) {
            const [p1, p2] = [...pn.pts.values()];
            const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const ratio = d / pn.startDist;
            if (mode === "grid") {
              const SIZES = [7, 5, 3]; // S, M, L
              const at = SIZES.indexOf(gridCols);
              if (ratio > 1.35 && at >= 0 && at < SIZES.length - 1) {
                changeGridCols(SIZES[at + 1]);
                pn.startDist = d; // re-arm so a long spread can step twice
              } else if (ratio < 0.74 && at > 0) {
                changeGridCols(SIZES[at - 1]);
                pn.startDist = d;
              }
            }
            return; // pinch moves never feed the scroll physics
          }
          eng.onPointerMove(e.clientX, e.clientY);
          const td = touchDrag.current;
          if (td && td.pointerId === e.pointerId) {
            const dy = td.lastY - e.clientY;
            eng.onWheel(dy);
            const dtMs = Math.max(1, e.timeStamp - td.lastT);
            td.vel = td.vel * 0.7 + (dy / dtMs) * 1000 * 0.3;
            td.lastY = e.clientY;
            td.lastT = e.timeStamp;
          }
        }}
        onPointerUp={(e) => {
          const eng = engineRef.current;
          eng?.onPointerUp();
          pinch.current.pts.delete(e.pointerId);
          if (pinch.current.pts.size < 2) pinch.current.startDist = null;
          // touch release: hand the finger's velocity to the engine as
          // kinetic momentum (iOS-style glide)
          const td = touchDrag.current;
          if (eng && td && td.pointerId === e.pointerId && Math.abs(td.vel) > 120) {
            eng.fling(td.vel);
          }
          touchDrag.current = null;
          // a quick, stationary press in grid mode is a click: zoom the note
          const p = press.current;
          press.current = null;
          if (
            eng &&
            p &&
            (mode === "grid" || mode === "wall") &&
            performance.now() - p.t < 500 &&
            Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8
          ) {
            if (mode === "grid") eng.onGridClick(p.idx);
            else eng.onWallClick(p.idx);
          }
        }}
        onPointerCancel={(e) => {
          engineRef.current?.onPointerUp();
          touchDrag.current = null;
          pinch.current.pts.delete(e.pointerId);
          if (pinch.current.pts.size < 2) pinch.current.startDist = null;
        }}
        onPointerLeave={() => engineRef.current?.pointerLeft()}
      >
        <DeskSurface
          count={all.length}
          shown={drawings.length}
          label={filterLabel}
          child={filter.child}
        />

        <div className="thread-months" data-visible={mode === "timeline"} aria-hidden>
          {monthMarks.map((m, k) => (
            <span
              key={m.label + m.i}
              className="thread-month"
              ref={(el) => {
                monthRefs.current[k] = el;
              }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="notes-layer">
          {drawings.map((d, i) => (
            <NoteCard
              key={d.id}
              drawing={d}
              index={i}
              featured={featured.has(d.id)}
              hires={mode === "grid" && gridCols <= 5}
              num={numById.get(d.id) ?? 0}
              attach={attach}
            />
          ))}
          {drawings.length === 0 && (
            <div className="empty-note">
              <p>Drawings will appear here soon.</p>
            </div>
          )}
        </div>

        <div className="nav-stack">
          <ModeSelector mode={mode} onChange={changeMode} />
          {mode === "grid" && (
            <div className="size-control" role="group" aria-label="Note size">
            <div className="size-btn-row">
              {([
                { label: "S", cols: 7 },
                { label: "M", cols: 5 },
                { label: "L", cols: 3 },
              ] as const).map((o) => (
                <button
                  key={o.label}
                  className="size-btn"
                  data-active={gridCols === o.cols}
                  onClick={() => changeGridCols(o.cols)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            </div>
          )}
        </div>

        {mode === "grid" && (
          <TimeStrip
            ref={stripRef}
            drawings={drawings}
            numById={numById}
            getLayout={() => gridLayoutRef.current}
            onJump={(y) => engineRef.current?.setGridScrollTarget(y)}
          />
        )}

        {mode === "wall" && loaded && (
          <WallRail
            ref={wallRailRef}
            drawings={drawings}
            getLayout={() => wallLayoutRef.current}
            onJump={(y) => engineRef.current?.setWallScrollTarget(y)}
          />
        )}

        {mode === "grid" && gridZoom && drawings[gridZoom.idx] && (
          <CaptionPill
            d={drawings[gridZoom.idx]}
            num={numById.get(drawings[gridZoom.idx].id)}
            top={`min(calc(50% + ${Math.round(gridZoom.size / 2) + 18}px), calc(100% - 150px))`}
            onPick={pickLabel}
          />
        )}

        {mode === "wall" && wallOpen && drawings[wallOpen.idx] && (
          <CaptionPill
            d={drawings[wallOpen.idx]}
            num={numById.get(drawings[wallOpen.idx].id)}
            top={`min(calc(45% + ${Math.round(wallOpen.size / 2) + 18}px), calc(100% - 150px))`}
            onPick={pickLabel}
          />
        )}

        <BackgroundPicker />

        <CornerButtons
          filterLabel={filterLabel}
          filterChild={filter.child}
          shown={drawings.length}
          pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen((o) => !o)}
          onClear={() => setFilter(EMPTY_FILTER)}
        />

        <MetadataPanel
          drawing={focus != null ? drawings[focus] ?? null : null}
          mode={mode}
          onPick={pickLabel}
        />
        {/* grid zoom and wall use the caption pill (wall: only when pinned);
            the riding card stays for scatter's hold-to-inspect */}
        <HoldMetadata
          ref={holdTipRef}
          drawing={
            held != null && mode !== "grid" && mode !== "wall"
              ? drawings[held] ?? null
              : null
          }
        />

        {(mode === "stack" || mode === "timeline" || mode === "scatter" || mode === "wall") &&
          loaded && (
            <div className="scroll-hint" key={mode}>
              {mode === "stack"
                ? "scroll to peel through the pad"
                : mode === "timeline"
                  ? "scroll to travel in time"
                  : mode === "wall"
                    ? "the wall parts around your hand — click to pin, scroll for more"
                    : "hold a note to look closer — scroll for more"}
            </div>
          )}
      </div>

      {/* outside the viewer, so presses and wheels on its scrim never reach the desk */}
      <IntroNote count={all.length} onClose={onIntroClose} />
      <SubjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        all={all}
        filter={filter}
        onChange={setFilter}
      />
    </>
  );
}
