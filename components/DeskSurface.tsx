"use client";

import { useEffect, useState } from "react";
import { SITE_TITLE } from "@/lib/drawings";
import { STORY_TEXT } from "@/lib/story";

/**
 * Desk background + the paper-slip title label (PRD §7). The slip is the
 * door to the origin story: click it and a larger sheet of the same paper
 * unfolds with the full paragraph.
 */
export function DeskSurface({ count }: { count: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="desk" aria-hidden />
      <div
        className="title-slip"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(true);
        }}
      >
        <span className="title-slip-tape" aria-hidden />
        <h1>{SITE_TITLE}</h1>
        <p>
          {count.toLocaleString()} drawings for my sons&rsquo; lunches
          {" · "}
          <span className="slip-hint">the story</span>
        </p>
      </div>

      {open && (
        <div className="story-backdrop" onClick={() => setOpen(false)}>
          <div className="story-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="title-slip-tape" aria-hidden />
            <h2>{SITE_TITLE}</h2>
            <p className="story-text">{STORY_TEXT}</p>
            <button className="story-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
