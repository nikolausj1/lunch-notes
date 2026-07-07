"use client";

import { forwardRef } from "react";

/**
 * SVG clothesline for Timeline mode. The path geometry is written
 * imperatively every frame by the engine's onThread callback —
 * React only renders the shell.
 */
export const TimelineThread = forwardRef<SVGPathElement, { visible: boolean }>(
  function TimelineThread({ visible }, ref) {
    return (
      <svg
        className="thread-svg"
        data-visible={visible}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path ref={ref} className="thread-path" d="" fill="none" />
      </svg>
    );
  }
);

/** Builds the sagging-thread path through note anchor points. */
export function threadPath(
  anchors: { x: number; y: number }[],
  tension: number,
  w: number
): string {
  if (anchors.length === 0) return "";
  const sagK = (1 - tension) * 16 + 3; // slack when idle, taut while scrolling
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let d = `M ${-40} ${first.y + sagK} L ${first.x} ${first.y}`;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + sagK;
    d += ` Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  d += ` L ${w + 40} ${last.y + sagK}`;
  return d;
}
