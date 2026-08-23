"use client";

import { memo, CSSProperties } from "react";
import { LunchDrawing } from "@/lib/types";
import { formatShort, formatShortYear } from "@/lib/dates";

type Props = {
  drawing: LunchDrawing;
  index: number;
  /** load the full-resolution image (stack top, timeline focus) */
  featured: boolean;
  /** cells render large (big grid): use the display image as the base */
  hires?: boolean;
  /** running number in the whole archive, oldest = 1 */
  num: number;
  attach: (i: number, el: HTMLDivElement | null) => void;
};

function NoteCardInner({ drawing, index, featured, hires, num, attach }: Props) {
  return (
    <div
      className="note"
      data-note-i={index}
      data-state="rest"
      ref={(el) => attach(index, el)}
    >
      <div
        className="note-paper"
        style={{ "--note-img": `url(${drawing.thumbSrc})` } as CSSProperties}
      >
        <img
          className="note-img"
          src={hires ? drawing.imageSrc : drawing.thumbSrc}
          alt={drawing.title ?? "Lunch drawing"}
          draggable={false}
          loading="lazy"
          decoding="async"
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
        <span className="note-flap" aria-hidden />
      </div>
      <span className="note-tape" aria-hidden />
      <div className="note-label">
        <span className="note-label-left">
          <span className="nl-full">{formatShortYear(drawing.date)}</span>
          <span className="nl-short">{formatShort(drawing.date)}</span>
        </span>
        <span className="note-label-num">#{num.toLocaleString()}</span>
      </div>
    </div>
  );
}

export const NoteCard = memo(
  NoteCardInner,
  // index MUST participate: it's the engine's element mapping (data-note-i),
  // and it shifts when the archive is filtered
  (a, b) =>
    a.drawing.id === b.drawing.id &&
    a.featured === b.featured &&
    a.hires === b.hires &&
    a.index === b.index &&
    a.num === b.num
);
