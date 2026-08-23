"use client";

import { useEffect, useState } from "react";
import { STORY_LINE } from "@/lib/story";

/**
 * Note-themed loading state (PRD §16.2): a tiny stack assembling, and the
 * origin story's one-liner underneath — read for free while the archive
 * loads, then buried as the post-its fly in over the fading veil.
 */
export function LoadingExperience({ done, count }: { done: boolean; count: number }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!done) return;
    // the fade is slow (CSS 1.3s) so the reveal's notes visibly cover the
    // story as it dissolves
    const t = setTimeout(() => setGone(true), 1500);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;

  return (
    <div className="loading" data-done={done}>
      <div className="loading-stack">
        <span className="loading-note" />
        <span className="loading-note" />
        <span className="loading-note" />
      </div>
      <p className="loading-story">{STORY_LINE}</p>
      <p className="loading-count">{count.toLocaleString()} and counting</p>
    </div>
  );
}
