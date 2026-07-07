"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LunchDrawing, ViewMode } from "@/lib/types";
import { formatLong } from "@/lib/dates";

/**
 * Current-note metadata for Stack and Timeline modes.
 * Styled like a small paper label sitting near the note (PRD §12.6, §13.6).
 */
export function MetadataPanel({
  drawing,
  mode,
}: {
  drawing: LunchDrawing | null;
  mode: ViewMode;
}) {
  const visible = drawing && (mode === "stack" || mode === "timeline");
  return (
    <div className={`meta-panel meta-panel-${mode}`}>
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={drawing.id}
            className="meta-card"
            initial={{ opacity: 0, y: 14, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: -0.5 }}
            exit={{ opacity: 0, y: -10, rotate: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="meta-date">{formatLong(drawing.date)}</div>
            {drawing.title && <div className="meta-title">{drawing.title}</div>}
            <div className="meta-row">
              {drawing.child && (
                <span className={`meta-child child-bg-${drawing.child.toLowerCase()}`}>
                  {drawing.child}
                </span>
              )}
              {drawing.tags?.map((t) => (
                <span key={t} className="meta-tag">{t}</span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small tooltip near the hovered note in Scatter mode (PRD §10.7). */
export function ScatterTooltip({
  drawing,
  pos,
}: {
  drawing: LunchDrawing | null;
  pos: { x: number; y: number } | null;
}) {
  return (
    <AnimatePresence>
      {drawing && pos && (
        <motion.div
          key={drawing.id}
          className="scatter-tip"
          style={{ left: pos.x, top: pos.y }}
          initial={{ opacity: 0, y: 6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.16 }}
        >
          <span className="tip-date">{formatLong(drawing.date)}</span>
          {drawing.title && <span className="tip-title">{drawing.title}</span>}
          {drawing.child && <span className="tip-child">by {drawing.child}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
