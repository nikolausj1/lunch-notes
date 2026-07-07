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

import { timelineGeometry, Viewport } from "@/lib/layouts";

/**
 * Builds the sagging-rope path: in over the viewer's left shoulder,
 * through the hanging notes, off to the vanishing point. Sag scales with
 * segment length so the rope tightens naturally into the distance.
 */
export function threadPath(
  anchors: { x: number; y: number }[],
  tension: number,
  vp: Viewport
): string {
  const { shoulder, van } = timelineGeometry(vp);
  // generous slack at rest, pulled nearly straight while scrolling;
  // tension can overshoot past 1 (spring), snapping the rope taut
  const slack = Math.max(0.02, (1 - tension) * 0.16 + 0.03);
  const pts = [shoulder, ...anchors, van];
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 0.01) continue;
    // sag hangs perpendicular to the (near-vertical) rope segment
    const sag = segLen * slack;
    const nx = -(b.y - a.y) / segLen;
    const ny = (b.x - a.x) / segLen;
    const sign = ny >= 0 ? 1 : -1;
    d += ` Q ${(a.x + b.x) / 2 + nx * sag * sign} ${(a.y + b.y) / 2 + ny * sag * sign} ${b.x} ${b.y}`;
  }
  return d;
}
