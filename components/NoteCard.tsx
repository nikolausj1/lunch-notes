"use client";

import { memo } from "react";
import { LunchDrawing } from "@/lib/types";
import { formatShort } from "@/lib/dates";

type Props = {
  drawing: LunchDrawing;
  index: number;
  /** load the full-resolution image (stack top, timeline focus) */
  featured: boolean;
  attach: (i: number, el: HTMLDivElement | null) => void;
};

function NoteCardInner({ drawing, index, featured, attach }: Props) {
  return (
    <div
      className="note"
      data-note-i={index}
      data-state="rest"
      ref={(el) => attach(index, el)}
    >
      <div className="note-paper">
        <img
          className="note-img"
          src={drawing.thumbSrc}
          alt={drawing.title ?? "Lunch drawing"}
          draggable={false}
          loading={index < 40 ? "eager" : "lazy"}
        />
        {featured && (
          <img
            className="note-img note-img-full"
            src={drawing.imageSrc}
            alt=""
            draggable={false}
          />
        )}
        <span className="note-curl" aria-hidden />
        <span className="note-underside" aria-hidden />
      </div>
      <span className="note-tape" aria-hidden />
      <div className="note-label">
        <span className="note-label-date">{formatShort(drawing.date)}</span>
        {drawing.child && <span className={`child-dot child-${drawing.child.toLowerCase()}`} />}
      </div>
    </div>
  );
}

export const NoteCard = memo(
  NoteCardInner,
  (a, b) => a.drawing.id === b.drawing.id && a.featured === b.featured
);
