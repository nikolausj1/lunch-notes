"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SITE_TITLE } from "@/lib/drawings";
import { STORY_LINE } from "@/lib/story";

// quick: the flight is only a hint of where the story lives now
const FLIGHT_MS = 400;

/**
 * The welcome note (replaces the old loading screen, PRD §16.2): the origin
 * story on the title slip's own paper, centered over a scrim on every visit
 * while the archive preloads behind it. "Open the Lunchbox", a click on the scrim,
 * or Escape flies the note up into the title slip in the corner (where the
 * story lives afterward), and onClose sets the post-its flying in.
 */
export function IntroNote({ count, onClose }: { count: number; onClose: () => void }) {
  const [phase, setPhase] = useState<"open" | "leaving" | "gone">("open");
  const noteRef = useRef<HTMLDivElement | null>(null);
  const goRef = useRef<HTMLButtonElement | null>(null);
  const leaving = useRef(false);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    onClose();

    const note = noteRef.current;
    const slip = document.querySelector<HTMLElement>(".title-slip");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!note || !slip || still) {
      // CSS fades the note out in place
      setTimeout(() => setPhase("gone"), 300);
      return;
    }

    // fly to wherever the slip actually sits (a tilted slip on desktop, the
    // full-width header on phones), matching its size and tilt
    const angle = (el: HTMLElement) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === "none") return 0;
      const m = new DOMMatrixReadOnly(t);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    const n = note.getBoundingClientRect();
    const s = slip.getBoundingClientRect();
    const dx = s.left + s.width / 2 - (n.left + n.width / 2);
    const dy = s.top + s.height / 2 - (n.top + n.height / 2);
    const sx = slip.offsetWidth / note.offsetWidth;
    const sy = slip.offsetHeight / note.offsetHeight;
    const timing = {
      duration: FLIGHT_MS,
      easing: "cubic-bezier(0.45, 0, 0.2, 1)",
      fill: "forwards" as const,
    };

    // the writing lifts off first, then the bare paper shrinks into the slip
    // and crossfades with it
    slip.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: FLIGHT_MS * 0.62,
      duration: FLIGHT_MS * 0.38,
      easing: "ease",
      fill: "backwards",
    });
    for (const child of Array.from(note.children)) {
      child.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FLIGHT_MS * 0.35,
        easing: "ease-out",
        fill: "forwards",
      });
    }
    note
      .animate(
        [
          { transform: `translate(0px, 0px) rotate(${angle(note)}deg) scale(1, 1)`, opacity: 1 },
          { opacity: 1, offset: 0.8 },
          {
            transform: `translate(${dx}px, ${dy}px) rotate(${angle(slip)}deg) scale(${sx}, ${sy})`,
            opacity: 0,
          },
        ],
        timing
      )
      .finished.catch(() => {})
      .then(() => setPhase("gone"));
  }, [onClose]);

  useEffect(() => {
    if (phase !== "open") return;
    goRef.current?.focus({ preventScroll: true });
    // the note is modal: keys never reach the desk beneath (Escape would
    // otherwise also close a shared drawing waiting under the note)
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        e.preventDefault();
        goRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, close]);

  if (phase === "gone") return null;

  return (
    <div className="intro" data-phase={phase} onClick={close}>
      <div
        ref={noteRef}
        className="intro-note"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="title-slip-tape" aria-hidden />
        <div className="intro-body">
          <h2 id="intro-title">{SITE_TITLE}</h2>
          <p className="intro-story">{STORY_LINE}</p>
          <div className="intro-foot">
            <p className="intro-count">{count.toLocaleString()} and counting</p>
            <button ref={goRef} className="intro-go" onClick={close}>
              Open the Lunchbox
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
