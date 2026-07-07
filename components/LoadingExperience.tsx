"use client";

import { useEffect, useState } from "react";

/** Note-themed loading state (PRD §16.2): a tiny stack assembling. */
export function LoadingExperience({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 600);
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
      <p>setting the table…</p>
    </div>
  );
}
