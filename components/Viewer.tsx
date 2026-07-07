"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDrawings } from "@/lib/drawings";
import { ViewMode } from "@/lib/types";
import { NotesEngine } from "@/lib/engine";
import { monthKey, formatMonth } from "@/lib/dates";
import { NoteCard } from "./NoteCard";
import { ModeSelector } from "./ModeSelector";
import { DeskSurface } from "./DeskSurface";
import { MetadataPanel, ScatterTooltip } from "./MetadataPanel";
import { TimelineThread, threadPath } from "./TimelineThread";
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
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const engineRef = useRef<NotesEngine | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<SVGPathElement | null>(null);
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
      onHover: (i) => {
        setHover(i);
        if (i != null && engineRef.current) {
          const n = engineRef.current.notes[i];
          const size = engineRef.current.noteSize;
          setTipPos({ x: n.x, y: n.y - size * 0.75 });
        } else {
          setTipPos(null);
        }
      },
      onThread: (anchors, tension, vp) => {
        threadRef.current?.setAttribute("d", threadPath(anchors, tension, vp.w));
        const byI = new Map(anchors.map((a) => [a.i, a]));
        monthMarks.forEach((m, k) => {
          const el = monthRefs.current[k];
          if (!el) return;
          const a = byI.get(m.i);
          if (a) {
            el.style.transform = `translate(${a.x - 40}px, ${a.y - 34}px)`;
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
      window.removeEventListener("keydown", onKey);
      surface?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings]);

  const changeMode = (m: ViewMode) => {
    setMode(m);
    setHover(null);
    setTipPos(null);
    engineRef.current?.setMode(m);
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
        if (e.pointerType !== "mouse" && mode !== "scatter") {
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
      onPointerUp={() => {
        engineRef.current?.onPointerUp();
        touchDrag.current = null;
      }}
      onPointerCancel={() => {
        engineRef.current?.onPointerUp();
        touchDrag.current = null;
      }}
      onPointerLeave={() => engineRef.current?.pointerLeft()}
    >
      <DeskSurface />

      <TimelineThread ref={threadRef} visible={mode === "timeline"} />
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
      <MetadataPanel
        drawing={focus != null ? drawings[focus] ?? null : null}
        mode={mode}
      />
      <ScatterTooltip
        drawing={hover != null ? drawings[hover] ?? null : null}
        pos={tipPos}
      />

      {(mode === "stack" || mode === "timeline") && loaded && (
        <div className="scroll-hint" key={mode}>
          {mode === "stack" ? "scroll to peel" : "scroll to travel in time"}
        </div>
      )}

      <LoadingExperience done={loaded} />
    </div>
  );
}
