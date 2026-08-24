"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDrawings, tagCounts } from "@/lib/drawings";
import { ViewMode } from "@/lib/types";
import { NotesEngine } from "@/lib/engine";
import { monthKey, formatMonth, formatShortYear } from "@/lib/dates";
import { ageGradeLabel } from "@/lib/kids";
import { NoteCard } from "./NoteCard";
import { ModeSelector } from "./ModeSelector";
import { DeskSurface } from "./DeskSurface";
import { MetadataPanel, HoldMetadata } from "./MetadataPanel";
import { LoadingExperience } from "./LoadingExperience";
import { BackgroundPicker } from "./BackgroundPicker";
import { TimeStrip, TimeStripHandle } from "./TimeStrip";

const MIN_LOAD_MS = 1700; // long enough to read the story line, no longer

/** ?count=N keeps a recent slice (testing); default is the whole archive */
function getCount(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const c = Number(new URLSearchParams(window.location.search).get("count"));
  return Number.isFinite(c) && c > 0 ? c : undefined;
}

export function Viewer() {
  const [count] = useState(getCount);
  const all = useMemo(() => getDrawings(count), [count]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const tags = useMemo(() => tagCounts(all), [all]);
  const drawings = useMemo(
    () => all.filter((d) => !tagFilter || (d.tags ?? []).includes(tagFilter)),
    [all, tagFilter]
  );
  // running number in the whole archive (oldest = #1), stable under filters
  const numById = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((d, i) => m.set(d.id, i + 1));
    return m;
  }, [all]);
  const [mode, setMode] = useState<ViewMode>("grid");
  const [gridCols, setGridCols] = useState(5); // M is the default note size
  const [focus, setFocus] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  // grid click-to-zoom: index + on-screen size of the open note (drives the caption pill)
  const [gridZoom, setGridZoomState] = useState<{ idx: number; size: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const engineRef = useRef<NotesEngine | null>(null);
  const firstLoadRef = useRef(true);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<TimeStripHandle | null>(null);
  const gridLayoutRef = useRef<{ ys: number[]; contentH: number } | null>(null);
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
      },
      onGridZoom: (i, sizePx) =>
        setGridZoomState(i == null ? null : { idx: i, size: sizePx }),
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
      .forEach((el) => eng.attach(Number(el.dataset.noteI), el));

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

    // preload thumbnails, then reveal (PRD §16). The wall (default mode)
    // shows the NEWEST drawings first, so preload from the end.
    const started = performance.now();
    const preload = drawings.slice(-160).map(
      (d) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = d.thumbSrc;
        })
    );
    let cancelled = false;
    Promise.race([
      Promise.allSettled(preload),
      new Promise((res) => setTimeout(res, 4500)),
    ]).then(() => {
      // the loading beat only plays once; filter changes rebuild instantly
      const wait = firstLoadRef.current
        ? Math.max(0, MIN_LOAD_MS - (performance.now() - started))
        : 0;
      firstLoadRef.current = false;
      setTimeout(() => {
        if (cancelled) return;
        setLoaded(true);
        eng.reveal();
        eng.start();
      }, wait);
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

  const changeMode = (m: ViewMode) => {
    setMode(m);
    setHeld(null);
    engineRef.current?.setMode(m);
  };

  const changeGridCols = (cols: number) => {
    setGridCols(cols);
    engineRef.current?.setGridCols(cols);
  };

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

  return (
    <div
      ref={surfaceRef}
      className="viewer"
      data-mode={mode}
      onPointerDown={(e) => {
        const eng = engineRef.current;
        if (!eng) return;
        // presses on UI controls must not start desk interactions or capture the pointer
        if ((e.target as HTMLElement).closest("button, .nav-stack, .filter-bar, .time-strip, .title-slip, .story-backdrop, .bg-picker")) return;
        const noteEl = (e.target as HTMLElement).closest("[data-note-i]");
        const idx = noteEl ? Number(noteEl.getAttribute("data-note-i")) : null;
        eng.onPointerDown(e.clientX, e.clientY, idx);
        press.current = { x: e.clientX, y: e.clientY, t: performance.now(), idx };
        if (e.pointerType !== "mouse" && mode !== "scatter" && !eng.stackDragging) {
          touchDrag.current = { lastY: e.clientY, lastT: e.timeStamp, vel: 0, pointerId: e.pointerId };
        }
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const eng = engineRef.current;
        if (!eng) return;
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
      onPointerCancel={() => {
        engineRef.current?.onPointerUp();
        touchDrag.current = null;
      }}
      onPointerLeave={() => engineRef.current?.pointerLeft()}
    >
      <DeskSurface count={all.length} />

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

      <div className="filter-bar" role="group" aria-label="Filter drawings">
        <select
          className="filter-select"
          value={tagFilter ?? ""}
          onChange={(e) => setTagFilter(e.target.value || null)}
          aria-label="Filter by subject"
        >
          <option value="">every subject</option>
          {tags.map(([t, n]) => (
            <option key={t} value={t}>
              {t} ({n})
            </option>
          ))}
        </select>
        {tagFilter && (
          <button
            className="filter-btn filter-clear"
            onClick={() => setTagFilter(null)}
          >
            {drawings.length.toLocaleString()} shown · clear ×
          </button>
        )}
      </div>

      {mode === "grid" &&
        gridZoom &&
        drawings[gridZoom.idx] &&
        (() => {
          const d = drawings[gridZoom.idx];
          return (
            <div
              className="zoom-pill"
              key={d.id}
              style={{ top: `calc(50% + ${Math.round(gridZoom.size / 2) + 18}px)` }}
            >
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
                  <span className="zp-num">
                    drawing #{numById.get(d.id)?.toLocaleString()}
                  </span>
                </span>
                {d.tags?.map((t) => (
                  <span key={t} className="meta-tag">{t}</span>
                ))}
              </div>
            </div>
          );
        })()}

      <BackgroundPicker />

      <MetadataPanel
        drawing={focus != null ? drawings[focus] ?? null : null}
        mode={mode}
      />
      {/* grid zoom puts everything in the caption pill instead */}
      <HoldMetadata
        ref={holdTipRef}
        drawing={held != null && mode !== "grid" ? drawings[held] ?? null : null}
      />

      {(mode === "stack" || mode === "timeline" || mode === "scatter" || mode === "wall") &&
        loaded && (
          <div className="scroll-hint" key={mode}>
            {mode === "stack"
              ? "scroll to peel"
              : mode === "timeline"
                ? "scroll to travel in time"
                : mode === "wall"
                  ? "the wall parts around your hand — click to pin, scroll for more"
                  : "hold a note to look closer — scroll for more"}
          </div>
        )}

      <LoadingExperience done={loaded} count={all.length} />
    </div>
  );
}
