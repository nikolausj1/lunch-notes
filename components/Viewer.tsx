"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDrawings } from "@/lib/drawings";
import { ViewMode } from "@/lib/types";
import { NotesEngine } from "@/lib/engine";
import { monthKey, formatMonth } from "@/lib/dates";
import { NoteCard } from "./NoteCard";
import { ModeSelector } from "./ModeSelector";
import { DeskSurface } from "./DeskSurface";
import { MetadataPanel, HoldMetadata } from "./MetadataPanel";
import { LoadingExperience } from "./LoadingExperience";

const MIN_LOAD_MS = 1100;

function getCount(): number {
  if (typeof window === "undefined") return 120;
  const c = Number(new URLSearchParams(window.location.search).get("count"));
  return Number.isFinite(c) && c > 0 ? Math.min(500, Math.max(1, c)) : 120;
}

export function Viewer() {
  const [count] = useState(getCount);
  const drawings = useMemo(() => getDrawings(count), [count]);
  const [mode, setMode] = useState<ViewMode>("scatter");
  const [gridCols, setGridCols] = useState(5);
  const [focus, setFocus] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const engineRef = useRef<NotesEngine | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
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
    });
    engineRef.current = eng;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __eng?: NotesEngine }).__eng = eng;
    }
    eng.setRoot(surfaceRef.current);
    // if the engine is recreated mid-session (fast refresh, strict mode),
    // adopt the mode the UI is already showing instead of resetting
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

    // preload thumbnails, then reveal (PRD §16)
    const started = performance.now();
    const preload = drawings.slice(0, 160).map(
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
      const wait = Math.max(0, MIN_LOAD_MS - (performance.now() - started));
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
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
      if (!fwd && !back) return;
      if (eng.mode === "stack") eng.onWheel(fwd ? 360 : -60);
      else if (eng.mode === "timeline") eng.onWheel(fwd ? 260 : -260);
      else if (eng.mode === "grid") eng.onWheel(fwd ? 160 : -160);
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
    return s;
  }, [mode, focus, drawings]);

  const touchDrag = useRef<{ lastY: number; pointerId: number } | null>(null);
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
        if ((e.target as HTMLElement).closest("button, .mode-selector")) return;
        const noteEl = (e.target as HTMLElement).closest("[data-note-i]");
        const idx = noteEl ? Number(noteEl.getAttribute("data-note-i")) : null;
        eng.onPointerDown(e.clientX, e.clientY, idx);
        press.current = { x: e.clientX, y: e.clientY, t: performance.now(), idx };
        if (e.pointerType !== "mouse" && mode !== "scatter" && !eng.stackDragging) {
          touchDrag.current = { lastY: e.clientY, pointerId: e.pointerId };
        }
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const eng = engineRef.current;
        if (!eng) return;
        eng.onPointerMove(e.clientX, e.clientY);
        const td = touchDrag.current;
        if (td && td.pointerId === e.pointerId) {
          eng.onWheel(td.lastY - e.clientY);
          td.lastY = e.clientY;
        }
      }}
      onPointerUp={(e) => {
        const eng = engineRef.current;
        eng?.onPointerUp();
        touchDrag.current = null;
        // a quick, stationary press in grid mode is a click: zoom the note
        const p = press.current;
        press.current = null;
        if (
          eng &&
          p &&
          mode === "grid" &&
          performance.now() - p.t < 500 &&
          Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8
        ) {
          eng.onGridClick(p.idx);
        }
      }}
      onPointerCancel={() => {
        engineRef.current?.onPointerUp();
        touchDrag.current = null;
      }}
      onPointerLeave={() => engineRef.current?.pointerLeft()}
    >
      <DeskSurface count={drawings.length} />

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
            attach={attach}
          />
        ))}
        {drawings.length === 0 && (
          <div className="empty-note">
            <p>Drawings will appear here soon.</p>
          </div>
        )}
      </div>

      <ModeSelector mode={mode} onChange={changeMode} />

      {mode === "grid" && (
        <div className="size-control" role="group" aria-label="Note size">
          <span className="size-control-label">note size</span>
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
      )}

      <MetadataPanel
        drawing={focus != null ? drawings[focus] ?? null : null}
        mode={mode}
      />
      <HoldMetadata
        ref={holdTipRef}
        drawing={held != null ? drawings[held] ?? null : null}
      />

      {(mode === "stack" || mode === "timeline" || mode === "scatter") && loaded && (
        <div className="scroll-hint" key={mode}>
          {mode === "stack"
            ? "scroll to peel"
            : mode === "timeline"
              ? "scroll to travel in time"
              : "hold a note to look closer — scroll for more"}
        </div>
      )}

      <LoadingExperience done={loaded} />
    </div>
  );
}
