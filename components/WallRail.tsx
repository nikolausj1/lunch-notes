"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { LunchDrawing } from "@/lib/types";

export type WallRailHandle = {
  layout: (ys: number[], height: number) => void;
  sync: (scroll: number, viewH: number, height: number) => void;
};

type Mark = { frac: number; kind: "year" | "sub"; label?: string };

/**
 * Wall mode's year rail: a slim right-edge ladder of year dots with
 * quarter sub-dots between them, a hairline through everything, and an
 * accent bead riding the line at the exact scroll position. Click or drag
 * anywhere on it to scrub the wall through time.
 */
export const WallRail = forwardRef<
  WallRailHandle,
  {
    drawings: LunchDrawing[];
    getLayout: () => { ys: number[]; h: number } | null;
    onJump: (y: number) => void;
  }
>(function WallRail({ drawings, getLayout, onJump }, ref) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const geom = useRef({ h: 0, viewH: 0 });
  const railRef = useRef<HTMLDivElement | null>(null);
  const beadRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const curYear = useRef<string>("");
  // month stretches (ascending frac = newest first) for the hover tooltip
  const months = useRef<{ frac: number; label: string }[]>([]);

  const compute = (ys: number[], h: number) => {
    if (!h || !ys.length) return;
    geom.current.h = h;
    // each year (and quarter) anchors at the wall-y of its newest drawing
    const yearMin = new Map<string, number>();
    const quarterMin = new Map<string, number>();
    const monthMin = new Map<string, number>();
    drawings.forEach((d, i) => {
      const y = ys[i];
      if (y == null || !d.date) return;
      const yr = d.date.slice(0, 4);
      const q = yr + "q" + Math.floor((Number(d.date.slice(5, 7)) - 1) / 3);
      const mo = d.date.slice(0, 7);
      if (!yearMin.has(yr) || y < yearMin.get(yr)!) yearMin.set(yr, y);
      if (!quarterMin.has(q) || y < quarterMin.get(q)!) quarterMin.set(q, y);
      if (!monthMin.has(mo) || y < monthMin.get(mo)!) monthMin.set(mo, y);
    });
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.current = [...monthMin.entries()]
      .map(([mo, y]) => ({
        frac: y / h,
        label: `${MONTH_NAMES[Number(mo.slice(5, 7)) - 1]} ${mo.slice(0, 4)}`,
      }))
      .sort((a, b) => a.frac - b.frac);
    const ms: Mark[] = [];
    yearMin.forEach((y, yr) =>
      ms.push({ frac: y / h, kind: "year", label: yr })
    );
    const yearFracs = ms.map((m) => m.frac);
    quarterMin.forEach((y) => {
      const f = y / h;
      // a quarter dot that coincides with a year dot would just double it
      if (yearFracs.every((yf) => Math.abs(yf - f) > 0.012))
        ms.push({ frac: f, kind: "sub" });
    });
    ms.sort((a, b) => a.frac - b.frac);
    setMarks(ms);
  };

  useImperativeHandle(ref, () => ({
    layout: compute,
    sync(scroll, viewH, h) {
      geom.current.viewH = viewH;
      if (h) geom.current.h = h;
      const f = Math.min(1, Math.max(0, (scroll + viewH / 2) / Math.max(1, h)));
      if (beadRef.current) beadRef.current.style.top = (f * 100).toFixed(3) + "%";
      // accent the year whose stretch the bead is in
      const rail = railRef.current;
      if (!rail) return;
      let year = "";
      for (const m of marks) if (m.kind === "year" && m.frac <= f + 0.006) year = m.label!;
      if (!year && marks.length) year = marks.find((m) => m.kind === "year")?.label ?? "";
      if (year !== curYear.current) {
        curYear.current = year;
        rail.querySelectorAll<HTMLElement>("[data-year]").forEach((el) => {
          if (el.dataset.year === year) el.dataset.on = "true";
          else delete el.dataset.on;
        });
      }
    },
  }));

  // the engine may have laid the wall out before this mounted
  useEffect(() => {
    const l = getLayout();
    if (l) compute(l.ys, l.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings]);

  const fracAt = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return null;
    const r = rail.getBoundingClientRect();
    // the marks live on an inset track (12px each end)
    return Math.min(1, Math.max(0, (clientY - r.top - 12) / (r.height - 24)));
  };

  const jump = (e: React.PointerEvent) => {
    const { h, viewH } = geom.current;
    const f = fracAt(e.clientY);
    if (f == null || !h) return;
    onJump(f * h - viewH / 2);
  };

  const showHover = (e: React.PointerEvent) => {
    const f = fracAt(e.clientY);
    if (f == null) return;
    const top = (f * 100).toFixed(3) + "%";
    if (hoverRef.current) {
      hoverRef.current.style.top = top;
      hoverRef.current.style.opacity = "1";
    }
    if (tipRef.current) {
      let label = "";
      for (const m of months.current) if (m.frac <= f + 0.004) label = m.label;
      if (!label && months.current.length) label = months.current[0].label;
      tipRef.current.textContent = label;
      tipRef.current.style.top = top;
      tipRef.current.style.opacity = label ? "1" : "0";
    }
  };

  const hideHover = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = "0";
    if (tipRef.current) tipRef.current.style.opacity = "0";
  };

  return (
    <div
      className="wall-rail"
      ref={railRef}
      role="slider"
      aria-label="Scrub the wall through time"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) jump(e);
        showHover(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onPointerLeave={hideHover}
    >
      <div className="wr-track" aria-hidden>
        <span className="wr-line" />
        {marks.map((m, i) =>
          m.kind === "year" ? (
            <span key={i}>
              <span
                className="wr-ydot"
                data-year={m.label}
                style={{ top: `${(m.frac * 100).toFixed(3)}%` }}
              />
              <span
                className="wr-ylabel"
                data-year={m.label}
                style={{ top: `${(m.frac * 100).toFixed(3)}%` }}
              >
                {m.label}
              </span>
            </span>
          ) : (
            <span
              key={i}
              className="wr-sub"
              style={{ top: `${(m.frac * 100).toFixed(3)}%` }}
            />
          )
        )}
        <div className="wr-hover" ref={hoverRef} />
        <div className="wr-tip" ref={tipRef} />
        <div className="wr-bead" ref={beadRef} />
      </div>
    </div>
  );
});
