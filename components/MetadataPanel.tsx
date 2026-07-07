"use client";

import { forwardRef } from "react";
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

/**
 * Metadata shown while a note is held up close in Scatter mode.
 * The wrapper is positioned imperatively every frame by the engine
 * (onHoldPos) so it rides along with the held note.
 */
export const HoldMetadata = forwardRef<
  HTMLDivElement,
  { drawing: LunchDrawing | null }
>(function HoldMetadata({ drawing }, ref) {
  return (
    <div className="scatter-tip" ref={ref}>
      <AnimatePresence>
        {drawing && (
          <motion.div
            key={drawing.id}
            className="meta-card"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, delay: drawing ? 0.12 : 0 }}
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
});
