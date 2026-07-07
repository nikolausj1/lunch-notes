"use client";

import { SITE_TITLE } from "@/lib/drawings";

/** Desk background + the small paper-slip title label (PRD §7). */
export function DeskSurface({ count }: { count: number }) {
  return (
    <>
      <div className="desk" aria-hidden />
      <div className="title-slip">
        <span className="title-slip-tape" aria-hidden />
        <h1>{SITE_TITLE}</h1>
        <p>{count.toLocaleString()} drawings for my sons&rsquo; lunches</p>
      </div>
    </>
  );
}
