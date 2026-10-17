import type { CSSProperties } from "react";
import { num, type LifespanData, type LifespanRow } from "@/lib/stats";
import { textWidth } from "./textMetrics";

/**
 * Lifespans: one row per series, one cell per calendar month, oldest series
 * first. A cell is the series' own color with its opacity set by how many
 * drawings that month held, from 0.18 for one drawing up to 1 in the series'
 * busiest month; months with no drawing stay empty. School years (Aug to Jul)
 * are told apart by alternating stripes behind the rows.
 *
 * Everything is laid out in the SVG's own units, so the whole chart scales with
 * the sheet. On a phone it keeps its size and scrolls sideways inside its own
 * box; the names then come from a second, pinned column (the same trick as the
 * calendar's year labels), because text inside an SVG cannot be sticky.
 */

const MIN_W = 820; // viewBox width; it only grows once the archive outgrows it
const NAME_W = 205; // names and totals live left of here; the first month's cell starts here
const STEP = 7; // a 6px cell and a 1px gap
const CELL_W = 6;
const CELL_H = 14;
const ROW_H = 22;
const HEAD = 24; // room above the first row for the school-year labels
const STRIPE_TOP = 17;
const RIGHT_PAD = 6;
const LABEL_GAP = 4; // a first/last month label to its cell
const NAME_GAP = 8; // a series name to its total
const CLEAR = 6; // room kept between a name and whatever comes next in its row
const MIN_OPACITY = 0.18;

const RULE = "rgba(63,58,49,.07)";
const STRIPE = "rgba(63,58,49,.04)";
const TICK = "rgba(63,58,49,.35)";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 2019", for a month counted from the archive's first */
function monthLabel(start: LifespanData["start"], offset: number): string {
  const cal = start.m + offset;
  return `${MON[cal % 12]} ${start.y + Math.floor(cal / 12)}`;
}

type Placed = {
  row: LifespanRow;
  top: number;
  /** the name as drawn: whole unless its row has no room for it */
  name: string;
  cells: { x: number; opacity: number; title: string }[];
  /** first month's label, right-aligned at x */
  lead: { x: number; text: string } | null;
  /** the label would sit under the pinned name column on a phone, so it is pinned there too */
  pin: boolean;
  /** last month's label, left-aligned at x */
  trail: { x: number; text: string } | null;
};

function ellipsize(name: string, tail: number, room: number): string {
  let s = name;
  while (s.length > 1 && textWidth(`${s}…`, 11.5, 700) + tail > room) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function place(data: LifespanData, width: number): Placed[] {
  return data.rows.map((row, i) => {
    const top = HEAD + i * ROW_H;
    const firstO = row.months[0][0];
    const lastO = row.months[row.months.length - 1][0];
    const firstX = NAME_W + firstO * STEP;

    const cells = row.months.map(([o, n]) => ({
      x: NAME_W + o * STEP,
      opacity: row.peak > 1 ? Math.round((MIN_OPACITY + (1 - MIN_OPACITY) * ((n - 1) / (row.peak - 1))) * 100) / 100 : 1,
      title: `${row.name}, ${monthLabel(data.start, o)}: ${num(n)} ${n === 1 ? "drawing" : "drawings"}`,
    }));

    // the last month's label sits just right of the last cell; it is dropped when it would run past the chart's edge
    const trailText = monthLabel(data.start, lastO);
    const trailX = NAME_W + lastO * STEP + CELL_W + LABEL_GAP;
    const trail = trailX + textWidth(trailText, 9.5, 600) <= width ? { x: trailX, text: trailText } : null;

    // the first month's label sits just left of the first cell; it is dropped when first and last are the same month
    let lead = firstO !== lastO ? { x: firstX - LABEL_GAP, text: monthLabel(data.start, firstO) } : null;

    // The name may run past the name column (its row is empty out there) but never into its own label or cells.
    // If it would, the label gives way first, and only then is the name shortened.
    const tail = NAME_GAP + textWidth(num(row.total), 11, 600);
    const nameW = textWidth(row.name, 11.5, 700) + tail;
    const leadW = lead ? textWidth(lead.text, 9.5, 600) : 0;
    if (lead && nameW + CLEAR > lead.x - leadW) lead = null;
    const room = (lead ? lead.x - leadW : firstX) - CLEAR;
    const name = nameW <= room ? row.name : ellipsize(row.name, tail, room);

    const pin = lead !== null && lead.x - leadW < NAME_W;

    return { row, top, name, cells, lead, pin, trail };
  });
}

export function Lifespans({ data }: { data: LifespanData }) {
  const width = Math.max(MIN_W, NAME_W + data.monthCount * STEP + RIGHT_PAD);
  const rows = place(data, width);
  const height = HEAD + data.rows.length * ROW_H;
  const label =
    `The ${data.rows.length} biggest series, oldest first: one row per series, one cell per month from ` +
    `${monthLabel(data.start, 0)} to ${monthLabel(data.start, data.monthCount - 1)}, darker for more drawings`;
  // the pinned phone column is laid out from the same numbers as the SVG, so the two cannot drift
  const vars = {
    "--ls-w": `${width}px`,
    "--ls-name": `${NAME_W}px`,
    "--ls-head": `${HEAD}px`,
    "--ls-row": `${ROW_H}px`,
  } as CSSProperties;

  return (
    <div className="nb-ls-scroll">
      <div className="nb-ls" style={vars}>
        <svg className="nb-chart nb-ls-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
          {data.years
            .filter((_, i) => i % 2 === 1)
            .map((y) => (
              <rect key={y.label} x={NAME_W + y.start * STEP} y={STRIPE_TOP} width={y.count * STEP} height={height - STRIPE_TOP} fill={STRIPE} />
            ))}

          {rows.map((p) => (
            <rect key={p.row.name} x={0} y={p.top + ROW_H - 1} width={width} height={1} fill={RULE} />
          ))}

          {data.years.map((y, i) => {
            const x = NAME_W + y.start * STEP;
            // a short school year at the edge of the archive keeps its tick but not a label that would crowd the next one
            const fits = i === data.years.length - 1 || y.count * STEP >= textWidth(y.label, 9.5, 700) + 8;
            return (
              <g key={y.label}>
                <rect x={x - 1} y={3} width={1} height={12} fill={TICK} />
                {fits && (
                  <text x={x + 4} y={9} dy=".35em" className="nb-ls-y">
                    {y.label}
                  </text>
                )}
              </g>
            );
          })}

          {rows.map((p) => (
            <g key={p.row.name}>
              <text x={0} y={p.top + 11} dy=".35em" className="nb-ls-nm">
                <a href={`/?tag=${p.row.slug}`}>
                  <tspan className="nb-lk nb-ls-link">{p.name}</tspan>
                </a>
                <tspan dx={NAME_GAP} className="nb-ls-total">
                  {num(p.row.total)}
                </tspan>
              </text>
              {p.cells.map((c) => (
                <rect key={c.x} x={c.x} y={p.top + 4} width={CELL_W} height={CELL_H} rx={1.5} fill={p.row.color} fillOpacity={c.opacity}>
                  <title>{c.title}</title>
                </rect>
              ))}
              {p.lead && (
                <text x={p.lead.x} y={p.top + 11} dy=".35em" textAnchor="end" className={p.pin ? "nb-ls-m nb-ls-pin" : "nb-ls-m"}>
                  {p.lead.text}
                </text>
              )}
              {p.trail && (
                <text x={p.trail.x} y={p.top + 11} dy=".35em" className="nb-ls-m">
                  {p.trail.text}
                </text>
              )}
            </g>
          ))}
        </svg>

        <ol className="nb-ls-names">
          {rows.map((p) => (
            <li key={p.row.name}>
              <a href={`/?tag=${p.row.slug}`}>{p.row.name}</a>
              <span>{num(p.row.total)}</span>
              {p.pin && p.lead && <em>{p.lead.text}</em>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
