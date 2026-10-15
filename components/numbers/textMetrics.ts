/**
 * Text-width estimates for the stats charts. The SVG labels are laid out on the
 * server, so we need to know before rendering whether a name fits its cell.
 * These are the advance widths of Nunito (the site's UI font) for printable
 * ASCII (code points 32 to 126) at weights 600, 700 and 800, measured at a
 * 100px font size with canvas measureText. Kerning is ignored (sums land within
 * about 1% of the kerned width), and a 2% margin keeps estimates on the safe side.
 */

const W600 = [
  26.4, 23.7, 41.7, 60, 60, 93.7, 70.8, 23.1, 33.6, 33.6, 45.2, 60,
  23.7, 42.9, 23.7, 29.7, 60, 60, 60, 60, 60, 60, 60, 60,
  60, 60, 23.7, 23.7, 60, 60, 60, 45, 94.8, 73.6, 68.2, 67.6,
  75.1, 58.9, 55.4, 73.1, 76.7, 26.8, 33.8, 64.3, 55.2, 86.1, 74.3, 77.5,
  64.2, 77.5, 67.7, 62.2, 61.1, 73.3, 70, 110.7, 66, 60.6, 59.6, 33.3,
  29.7, 33.3, 60, 50, 36.6, 53.7, 59.1, 46.7, 59.1, 53.7, 34.7, 59.4,
  57.6, 24.3, 24.6, 51.6, 30.6, 86.6, 57.6, 56.5, 59.1, 59.1, 37.3, 48.4,
  36.5, 56.9, 52, 84.6, 53.4, 52, 46.8, 37, 27.5, 37, 60,
];

const W700 = [
  27.1, 24.8, 44.8, 60, 60, 94.5, 72.6, 24.3, 35.8, 35.8, 45.3, 60,
  24.8, 43.4, 24.8, 31.3, 60, 60, 60, 60, 60, 60, 60, 60,
  60, 60, 24.8, 24.8, 60, 60, 60, 45.9, 95, 74.4, 68.8, 68,
  76.2, 59.7, 56.2, 73.6, 77.3, 28.2, 35.4, 66.5, 56.2, 86.8, 74.8, 78.5,
  65.2, 78.5, 68.6, 63.1, 62.1, 73.8, 71.3, 111.3, 67.2, 61.8, 60.5, 35.4,
  31.3, 35.4, 60, 50, 37.7, 54.7, 60, 47.2, 60, 54.2, 36.4, 60.4,
  58.5, 25.5, 25.9, 53.6, 31.9, 87.7, 58.5, 57.6, 60, 60, 39.2, 48.8,
  38.4, 57.9, 52.7, 85.3, 54.6, 52.6, 47.4, 39.1, 28.8, 39.1, 60,
];

const W800 = [
  27.9, 26, 48.1, 60, 60, 95.4, 74.5, 25.6, 38.2, 38.2, 45.4, 60,
  26, 44, 26, 33.1, 60, 60, 60, 60, 60, 60, 60, 60,
  60, 60, 26, 26, 60, 60, 60, 46.8, 95.2, 75.3, 69.5, 68.4,
  77.4, 60.5, 57, 74.2, 78, 29.7, 37.2, 68.8, 57.3, 87.6, 75.3, 79.6,
  66.4, 79.6, 69.6, 64.1, 63.2, 74.3, 72.7, 112, 68.5, 63.1, 61.5, 37.7,
  33.1, 37.7, 60, 50, 38.8, 55.7, 61, 47.8, 61, 54.9, 38.2, 61.5,
  59.5, 26.8, 27.3, 55.8, 33.3, 88.9, 59.5, 58.9, 61, 61, 41.2, 49.2,
  40.4, 59, 53.4, 86.1, 55.9, 53.3, 48, 41.4, 30.2, 41.4, 60,
];

/** advance for anything outside printable ASCII (curly quotes, middots, ...) */
const FALLBACK = 55;

function table(weight: number): number[] {
  if (weight >= 750) return W800;
  if (weight >= 650) return W700;
  return W600;
}

/** estimated rendered width in px of `text` in Nunito at `size` px and `weight` */
export function textWidth(text: string, size: number, weight = 700): number {
  const t = table(weight);
  let sum = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    sum += code >= 32 && code <= 126 ? t[code - 32] : FALLBACK;
  }
  return (sum * size * 1.02) / 100;
}

/**
 * Greedy word wrap by estimated width. Returns null when a single word is
 * wider than `maxWidth` (the label then does not fit at all).
 */
export function wrapWords(text: string, maxWidth: number, size = 11, weight = 700): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? cur + " " + word : word;
    if (cur && textWidth(next, size, weight) > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  lines.push(cur);
  return lines.some((l) => textWidth(l, size, weight) > maxWidth) ? null : lines;
}
