"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { LunchDrawing } from "@/lib/types";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TimeStripHandle = {
  /** engine tick: current scroll window in grid content space */
  sync: (scroll: number, viewH: number, contentH: number) => void;
  /** grid layout changed: content-space y per note index + total height */
  layout: (ys: number[], contentH: number) => void;
};

type Tick = {
  key: string; // "2024-06"
  label: string; // "Jun 2024"
  num: number; // archive # of the month's first drawing
  jan: boolean;
  year: string;
  noteIndex: number; // a note in this month (its y anchors jumps + ink)
  idx: number; // chronological month index, 0 = oldest
};

/**
 * Grid mode's right-edge timeline — the "ink range" strip: one ruler tick
 * per month (newest at top, matching the grid), the months on screen are
 * written in dark ink, ticks magnify dock-style near the cursor, hovering
 * reads out "Jun 2024 · #1,532", and click/drag scrubs the grid.
 */
export const TimeStrip = forwardRef<
  TimeStripHandle,
  {
    drawings: LunchDrawing[];
    numById: Map<string, number>;
    /** latest grid layout, in case it arrived before this strip mounted */
    getLayout: () => { ys: number[]; contentH: number } | null;
    onJump: (y: number) => void;
  }
>(function TimeStrip({ drawings, numById, getLayout, onJump }, ref) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const geom = useRef<{ ys: number[]; contentH: number } | null>(null);
  const win = useRef({ top: 0, bottom: 0 });

  // one tick per month; the anchor note is the month's newest drawing
  // (smallest y in the newest-first grid)
  const ticks = useMemo<Tick[]>(() => {
    const seen = new Map<string, Tick>();
    drawings.forEach((d, i) => {
      const key = d.date.slice(0, 7);
      const t = seen.get(key);
      const num = numById.get(d.id) ?? 0;
      if (!t) {
        seen.set(key, {
          key,
          label: `${MONTH_NAMES[+d.date.slice(5, 7) - 1]} ${d.date.slice(0, 4)}`,
          num,
          jan: key.endsWith("-01"),
          year: d.date.slice(0, 4),
          noteIndex: i, // drawings are oldest->newest; overwritten below
          idx: seen.size,
        });
      } else {
        t.num = Math.min(t.num, num);
        t.noteIndex = i; // ends at the month's newest note (topmost row)
      }
    });
    return [...seen.values()];
  }, [drawings, numById]);

  // months are EVENLY spaced along the rail (a calendar axis, newest at
  // the top to match the grid) — not proportional to how much grid each
  // month occupies
  const fracOf = (t: Tick) =>
    ticks.length < 2 ? 0 : (ticks.length - 1 - t.idx) / (ticks.length - 1);

  /** rail fraction (0..1, top=newest) for a content-space y, interpolated
   *  between month anchors */
  const railFracFor = (y: number) => {
    const g = geom.current;
    if (!g || ticks.length < 2) return 0;
    // ticks[0] = oldest (rail frac 1, LARGEST content y); anchors shrink
    // as the index climbs toward the newest month at the rail top
    const anchor = (k: number) => g.ys[ticks[k].noteIndex] ?? 0;
    if (y >= anchor(0)) return 1;
    if (y <= anchor(ticks.length - 1)) return 0;
    for (let k = 0; k < ticks.length - 1; k++) {
      const ya = anchor(k); // larger
      const yb = anchor(k + 1); // smaller
      if (y <= ya && y >= yb) {
        const u = (ya - y) / Math.max(1, ya - yb);
        return fracOf(ticks[k]) + (fracOf(ticks[k + 1]) - fracOf(ticks[k])) * u;
      }
    }
    return 0;
  };

  const applyInk = () => {
    const rail = railRef.current;
    const g = geom.current;
    if (!rail || !g) return;
    // the indicator is a bulge in RAIL space: centered on the visible
    // range, never narrower than a handful of ticks so the curve reads
    const fa = railFracFor(win.current.top);
    const fb = railFracFor(win.current.bottom);
    const center = (fa + fb) / 2;
    const half = Math.max(Math.abs(fb - fa) / 2, 0.05);
    rail.querySelectorAll<HTMLElement>("[data-tick]").forEach((el) => {
      const f = parseFloat(el.style.top) / 100;
      const d = (f - center) / half;
      if (Math.abs(d) <= 1.25) {
        // cosine falloff: longest at center, tapering at the ends
        const bulge = Math.cos(Math.max(-1, Math.min(1, d)) * Math.PI * 0.5);
        const base = el.dataset.jan === "true" ? 20 : 11;
        // one smooth silhouette: the curve sets the length, not the base
        el.style.width = Math.max(base, 8 + bulge * 30) + "px";
        el.dataset.on = String(bulge > 0.12);
      } else {
        el.style.width = "";
        el.dataset.on = "false";
      }
    });
  };

  const reposition = () => {
    const rail = railRef.current;
    if (!rail) return;
    const g = geom.current;
    rail.querySelectorAll<HTMLElement>("[data-tick]").forEach((el, k) => {
      if (k < ticks.length) {
        const t = ticks[k];
        el.dataset.y = String(g ? g.ys[t.noteIndex] ?? 0 : 0);
        el.style.top = fracOf(t) * 100 + "%";
      } else {
        // minor tick: midway between adjacent months (double density)
        const a = ticks[k - ticks.length];
        const b = ticks[k - ticks.length + 1];
        if (!a || !b) return;
        const ya = g ? g.ys[a.noteIndex] ?? 0 : 0;
        const yb = g ? g.ys[b.noteIndex] ?? 0 : 0;
        el.dataset.y = String((ya + yb) / 2);
        el.style.top = ((fracOf(a) + fracOf(b)) / 2) * 100 + "%";
      }
    });
    const jans = ticks.filter((t) => t.jan);
    rail.querySelectorAll<HTMLElement>(".ts-year").forEach((el, k) => {
      if (jans[k]) el.style.top = fracOf(jans[k]) * 100 + "%";
    });
    applyInk();
  };

  // grid layout can land before the strip mounts (mode-change ordering)
  useEffect(() => {
    const l = getLayout();
    if (l) {
      geom.current = l;
      reposition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks, getLayout]);

  useImperativeHandle(ref, () => ({
    sync(scroll, viewH, contentH) {
      if (geom.current) geom.current.contentH = contentH;
      const changed =
        Math.abs(scroll - win.current.top) > 0.5 ||
        Math.abs(scroll + viewH - win.current.bottom) > 0.5;
      win.current = { top: scroll, bottom: scroll + viewH };
      if (changed) applyInk();
    },
    layout(ys, contentH) {
      geom.current = { ys, contentH };
      reposition();
    },
  }));

  // dock magnification + hover readout + scrubbing
  const scrub = useRef(false);
  const move = (clientY: number, doJump: boolean) => {
    const rail = railRef.current;
    const tip = tipRef.current;
    const g = geom.current;
    if (!rail || !g) return;
    const r = rail.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    // magnify ticks near the cursor
    rail.querySelectorAll<HTMLElement>("[data-tick]").forEach((el) => {
      const d = Math.abs((parseFloat(el.style.top) / 100) * r.height - f * r.height);
      const k = Math.exp(-(d / 64) * (d / 64));
      el.style.transform = `translateY(-50%) scaleX(${1 + k * 1.8}) scaleY(${1 + k * 1.3})`;
    });
    // readout + jump target: the rail is a uniform calendar axis, so the
    // cursor maps to a month index directly; jumps interpolate between the
    // adjacent months' grid anchors
    const p = (1 - f) * (ticks.length - 1);
    const best = ticks[Math.round(p)];
    if (tip && best) {
      tip.style.top = f * 100 + "%";
      tip.innerHTML = `<b>${best.label}</b> · #${best.num.toLocaleString()}`;
      tip.dataset.on = "true";
    }
    if (doJump) {
      const a = ticks[Math.floor(p)];
      const b = ticks[Math.ceil(p)];
      const ya = g.ys[a.noteIndex] ?? 0;
      const yb = g.ys[b.noteIndex] ?? 0;
      onJump(ya + (yb - ya) * (p - Math.floor(p)) - 120);
    }
  };
  const leave = () => {
    const rail = railRef.current;
    if (rail)
      rail.querySelectorAll<HTMLElement>("[data-tick]").forEach((el) => {
        el.style.transform = "translateY(-50%)";
      });
    if (tipRef.current) tipRef.current.dataset.on = "false";
  };

  if (ticks.length < 2) return null;
  return (
    <div
      className="time-strip"
      ref={railRef}
      onPointerDown={(e) => {
        scrub.current = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
        move(e.clientY, true);
      }}
      onPointerMove={(e) => move(e.clientY, scrub.current)}
      onPointerUp={() => (scrub.current = false)}
      onPointerLeave={() => { scrub.current = false; leave(); }}
    >
      {ticks.map((t) => (
        <span key={t.key} data-tick data-jan={t.jan} data-on="false" className="ts-tick" />
      ))}
      {ticks.slice(0, -1).map((t) => (
        <span key={"mid" + t.key} data-tick data-minor="true" data-on="false" className="ts-tick" />
      ))}
      {ticks.filter((t) => t.jan).map((t) => (
        <span key={"y" + t.key} className="ts-year" style={{ top: fracOf(t) * 100 + "%" }}>
          {t.year}
        </span>
      ))}
      <div className="ts-tip" ref={tipRef} data-on="false" />
    </div>
  );
});
