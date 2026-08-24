"use client";

import { useEffect, useRef, useState } from "react";
import { syncThemeColor } from "@/lib/theme";

const DEFAULT_DESK = "#e6e6e6";
const STORAGE_KEY = "lbd-desk-color";

/** six alternatives with more contrast against the pale post-its */
const PRESETS: { name: string; color: string }[] = [
  { name: "Sand", color: "#d9c9a8" },
  { name: "Cork", color: "#b99a72" },
  { name: "Sage", color: "#a9b39e" },
  { name: "Slate", color: "#97a7b5" },
  { name: "Charcoal", color: "#4c4841" },
  { name: "Night", color: "#2e3237" },
];

/** relative luminance 0..1 — decides when on-desk text flips light */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * chan((n >> 16) & 255) +
    0.7152 * chan((n >> 8) & 255) +
    0.0722 * chan(n & 255)
  );
}

function applyDesk(color: string) {
  const root = document.documentElement;
  root.style.setProperty("--desk", color);
  if (luminance(color) < 0.45) root.dataset.deskDark = "true";
  else delete root.dataset.deskDark;
  syncThemeColor();
}

export function BackgroundPicker() {
  const [color, setColor] = useState(DEFAULT_DESK);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // restore the saved choice
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
      setColor(saved);
      applyDesk(saved);
    }
  }, []);

  // clicking anywhere else closes the popover
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (c: string) => {
    setColor(c);
    applyDesk(c);
    localStorage.setItem(STORAGE_KEY, c);
  };

  return (
    <div className="bg-picker" ref={rootRef}>
      {open && (
        <div className="bg-pop" role="group" aria-label="Background color">
          <div className="bg-swatches">
            {PRESETS.map((p) => (
              <button
                key={p.color}
                className="bg-swatch"
                style={{ background: p.color }}
                data-active={color.toLowerCase() === p.color}
                title={p.name}
                aria-label={p.name}
                onClick={() => pick(p.color)}
              />
            ))}
          </div>
          <label className="bg-custom-row">
            custom
            <input
              type="color"
              value={color}
              onChange={(e) => pick(e.target.value)}
              aria-label="Custom background color"
            />
          </label>
          <button className="bg-reset" onClick={() => pick(DEFAULT_DESK)}>
            reset to original
          </button>
        </div>
      )}
      <button
        className="bg-picker-btn"
        style={{ background: color }}
        aria-label="Change background color"
        aria-expanded={open}
        title="Background color"
        onClick={() => setOpen((o) => !o)}
      />
    </div>
  );
}
