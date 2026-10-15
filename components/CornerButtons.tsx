"use client";

import type { ReactNode } from "react";

/**
 * Two tertiary utilities in the upper right of the desk (PRD §20.1): the
 * subject picker and the stats page, as frosted circles that mirror the color
 * picker in the lower right. With a subject filter on, the subjects circle
 * wears a small accent dot and a chip ("Ocean · 211 ×") appears to its left;
 * the whole chip is the clear button. On phones the pair rides in the paper
 * header and slides away with it; the chip stays home there (the picker's own
 * header names the active subject).
 */

/** how the active filter reads: "Ocean", "Vinny" (child only) or "Ocean · Vinny" */
export function filterTitle(
  label: string | null,
  child: "Chase" | "Vinny" | null
): string | null {
  if (label && child) return `${label} · ${child}`;
  return label ?? child;
}

/** line glyph on a 24px grid, one stroke recipe (approved mockup, frame 10: a / a) */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CornerButtons({
  filterLabel,
  filterChild,
  shown,
  pickerOpen,
  onTogglePicker,
  onClear,
}: {
  /** display name of the active subject, if any */
  filterLabel: string | null;
  filterChild: "Chase" | "Vinny" | null;
  /** drawings on the desk right now */
  shown: number;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClear: () => void;
}) {
  const active = Boolean(filterLabel || filterChild);
  return (
    <div className="corner-utils">
      {active && (
        <button
          type="button"
          className="corner-active"
          aria-label="Clear the subject filter"
          onClick={onClear}
        >
          <span className="corner-active-label">{filterTitle(filterLabel, filterChild)}</span>
          <span className="corner-active-n">· {shown.toLocaleString()}</span>
          <span className="corner-x" aria-hidden="true">
            ×
          </span>
        </button>
      )}
      <button
        type="button"
        className="corner-btn"
        data-active={active}
        aria-expanded={pickerOpen}
        aria-haspopup="dialog"
        aria-label="Subjects"
        title="Subjects"
        onClick={onTogglePicker}
      >
        {/* a luggage tag, lying on its side */}
        <Glyph>
          <g transform="translate(-1.16 -1.16) rotate(45 12 12)">
            <path d="M2.2 12 L6.6 7.2 H20 A1.6 1.6 0 0 1 21.6 8.8 V15.2 A1.6 1.6 0 0 1 20 16.8 H6.6 Z" />
            <circle cx="7.8" cy="12" r="1" fill="currentColor" stroke="none" />
          </g>
        </Glyph>
      </button>
      <a className="corner-btn" href="/numbers" aria-label="By the numbers" title="By the numbers">
        {/* three bars */}
        <Glyph>
          <rect x="3.5" y="13.2" width="3.8" height="7.3" rx="1" />
          <rect x="10.1" y="8.4" width="3.8" height="12.1" rx="1" />
          <rect x="16.7" y="3.5" width="3.8" height="17" rx="1" />
        </Glyph>
      </a>
    </div>
  );
}
