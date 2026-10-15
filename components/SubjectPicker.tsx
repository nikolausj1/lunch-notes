"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LunchDrawing } from "@/lib/types";
import {
  applyFilter,
  EMPTY_FILTER,
  Filter,
  labelForSlug,
  pickerGroups,
  slugify,
} from "@/lib/taxonomy";
import { filterTitle } from "./CornerButtons";

/** the stylesheet's phone breakpoint (title slip, nav stack): a bottom sheet instead of a card */
const PHONE_MQ = "(max-width: 640px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isPhoneNow = () => window.matchMedia(PHONE_MQ).matches;
const isPhoneOnServer = () => false;

const WHOSE = [
  { label: "Both", child: null },
  { label: "Chase", child: "Chase" },
  { label: "Vinny", child: "Vinny" },
] as const;

/** chips grow with their count: 13px from 150 drawings, 12px from 50, 11.5px below */
const tierOf = (count: number) => (count >= 150 ? 1 : count >= 50 ? 2 : 3);

type Props = {
  open: boolean;
  onClose: () => void;
  all: LunchDrawing[];
  filter: Filter;
  onChange: (f: Filter) => void;
};

/**
 * The subject card (mockup frame 5): grouped label chips with counts, a
 * Both/Chase/Vinny toggle, a search field, and the door to the stats page.
 * A paper card under the corner buttons on desktop, a bottom sheet on phones.
 * Rendered OUTSIDE .viewer so typing and scrolling inside it never reach the
 * desk. Mounted only while open, so the search starts empty every time.
 */
export function SubjectPicker({ open, ...rest }: Props) {
  if (!open) return null;
  return <PickerCard {...rest} />;
}

function PickerCard({ onClose, all, filter, onChange }: Omit<Props, "open">) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, isPhoneOnServer);

  // the listeners below bind once; they call whichever onClose is current
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // focus the card itself, never a button (iOS draws a ring around scripted
  // focus on one); on the way out, hand focus back to the subjects circle
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      const a = document.activeElement;
      if (!a || a === document.body) {
        document
          .querySelector<HTMLElement>('.corner-utils [aria-label="Subjects"]')
          ?.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape, or a press anywhere outside the card and the corner buttons (the
  // circle toggles the card itself; on phones the scrim closes it on click)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // this Escape is the picker's: a note opened underneath stays put
      e.stopPropagation();
      e.preventDefault();
      closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.(".subject-picker, .corner-utils, .sp-scrim")) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  // the chips count the child's drawings only when a child is chosen
  const set = useMemo(
    () => (filter.child ? all.filter((d) => d.child === filter.child) : all),
    [all, filter.child]
  );
  const groups = useMemo(() => pickerGroups(set), [set]);

  const q = query.trim().toLowerCase();
  const qSlug = slugify(query);
  const visible = useMemo(() => {
    if (!q) return groups;
    const hit = (name: string) =>
      name.toLowerCase().includes(q) || (qSlug !== "" && slugify(name).includes(qSlug));
    return groups
      .map((g) => ({ ...g, items: g.items.filter((it) => hit(it.name)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, q, qSlug]);

  const label = useMemo(
    () => (filter.tag ? (labelForSlug(all, filter.tag) ?? filter.tag) : null),
    [all, filter.tag]
  );
  const title = filterTitle(label, filter.child);
  const nShown = useMemo(() => applyFilter(all, filter).length, [all, filter]);

  const pick = (slug: string) => {
    // the active chip is a toggle: pressing it again clears the subject
    onChange({ tag: filter.tag === slug ? null : slug, child: filter.child });
    onClose();
  };

  return (
    <>
      {isPhone && <div className="sp-scrim" aria-hidden="true" onClick={onClose} />}
      <div
        ref={cardRef}
        className="subject-picker"
        role="dialog"
        aria-label="Pick a subject"
        aria-modal={isPhone ? true : undefined}
        tabIndex={-1}
        onKeyDown={(e) => {
          // arrow keys inside the card must not also scroll the desk behind it
          if (e.key.startsWith("Arrow")) e.stopPropagation();
        }}
      >
        <span className="title-slip-tape" aria-hidden="true" />
        <i className="sp-grab" aria-hidden="true" />

        <div className="sp-head">
          <h2 className="sp-title">By subject</h2>
          <div className="sp-seg" role="group" aria-label="Whose drawings">
            {WHOSE.map((o) => (
              <button
                type="button"
                key={o.label}
                className="sp-seg-btn"
                data-active={filter.child === o.child}
                aria-pressed={filter.child === o.child}
                onClick={() => {
                  if (filter.child !== o.child) onChange({ tag: filter.tag, child: o.child });
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {title && (
          <div className="sp-active">
            <span className="sp-active-text">
              <b>{title}</b> · {nShown.toLocaleString()} {nShown === 1 ? "drawing" : "drawings"}
            </span>
            <button type="button" className="sp-clear" onClick={() => onChange(EMPTY_FILTER)}>
              clear
            </button>
          </div>
        )}

        <label className="sp-search">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 8l3 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            className="sp-input"
            type="search"
            value={query}
            placeholder="Search subjects…"
            aria-label="Search subjects"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter takes the first match
              const first = visible[0]?.items[0];
              if (e.key === "Enter" && first && q && !e.nativeEvent.isComposing) {
                e.preventDefault();
                pick(first.slug);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="sp-search-clear"
              aria-label="Clear search"
              onClick={(e) => {
                e.preventDefault();
                setQuery("");
                e.currentTarget.parentElement?.querySelector("input")?.focus();
              }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
                <path
                  d="M1 1l6 6M7 1L1 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </label>

        <div className="sp-groups">
          <div className="sp-scroll">
            {visible.map((g) => (
              <section className="sp-group" key={g.title}>
                <h3 className="sp-eyebrow">{g.title}</h3>
                <div className="sp-chips">
                  {g.items.map((it) => {
                    const on = filter.tag === it.slug;
                    return (
                      <button
                        type="button"
                        key={it.slug}
                        className="sp-chip"
                        data-tier={tierOf(it.count)}
                        data-active={on}
                        aria-pressed={on}
                        onClick={() => pick(it.slug)}
                      >
                        {it.name}
                        <span className="sp-n">{it.count.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {visible.length === 0 && (
              <p className="sp-empty" role="status">
                {q ? <>No subjects match “{query.trim()}”.</> : "No subjects yet."}
              </p>
            )}
          </div>
        </div>

        <div className="sp-foot">
          <a className="sp-numbers" href="/numbers">
            <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" focusable="false">
              <rect x="0" y="8" width="4" height="6" rx="1" fill="currentColor" />
              <rect x="6" y="4" width="4" height="10" rx="1" fill="currentColor" />
              <rect x="12" y="0" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
            <span className="sp-numbers-text">
              <span className="sp-numbers-title">By the numbers</span>
              <span className="sp-numbers-sub">series, eras, every school day</span>
            </span>
            <svg
              className="sp-numbers-arrow"
              width="14"
              height="10"
              viewBox="0 0 14 10"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M1 5h11M8 1.2L12.2 5 8 8.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </>
  );
}
