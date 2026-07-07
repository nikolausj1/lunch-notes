"use client";

import { motion } from "framer-motion";
import { MODES, ViewMode } from "@/lib/types";

const LABELS: Record<ViewMode, string> = {
  scatter: "Scatter",
  grid: "Grid",
  stack: "Stack",
  timeline: "Timeline",
};

export function ModeSelector({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="mode-selector" role="tablist" aria-label="View mode">
      {MODES.map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          className="mode-btn"
          data-active={mode === m}
          onClick={() => onChange(m)}
        >
          {mode === m && (
            <motion.span
              layoutId="mode-pill"
              className="mode-pill"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="mode-btn-label">{LABELS[m]}</span>
        </button>
      ))}
    </div>
  );
}
