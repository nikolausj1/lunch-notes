import { num, type CalendarCell, type CalendarYear } from "@/lib/stats";

/** 11px cells on a 13px step = 2px gaps; Monday to Friday, so five rows */
const STEP = 13;
const CELL = 11;
const TOP = 14; // room for the month initials
const HEIGHT = TOP + 5 * STEP - 2;
const INITIALS = "JFMAMJJASOND";
const OUTLINE = "rgba(63,58,49,.22)";

/** one path per fill color: every cell is a 7x7 square stroked 4px with round joins = an 11x11 square with 2px corners */
function filledPath(cells: CalendarCell[]): string {
  return cells.map((c) => `M${c.col * STEP + 2} ${TOP + c.row * STEP + 2}h7v7h-7z`).join("");
}

function outlinePath(cells: CalendarCell[]): string {
  return cells.map((c) => `M${c.col * STEP + 0.5} ${TOP + c.row * STEP + 0.5}h${CELL - 1}v${CELL - 1}h${1 - CELL}z`).join("");
}

/**
 * Every school day, one block per school year (Aug to Jul). A column is a week,
 * the rows are Monday to Friday; a cell is the day's theme color, warm grey when
 * a drawing had no theme, and just an outline when there was no drawing.
 * The year label stays put (sticky) while a phone scrolls the weeks sideways.
 */
export function Calendar({ years }: { years: CalendarYear[] }) {
  const cols = Math.max(...years.map((y) => y.cols));
  const width = cols * STEP - 2;
  return (
    <div className="nb-cal-scroll">
      <div className="nb-cal">
        {years.map((y) => {
          const byFill = new Map<string, CalendarCell[]>();
          const empty: CalendarCell[] = [];
          for (const c of y.cells) {
            if (c.fill === null) empty.push(c);
            else byFill.set(c.fill, [...(byFill.get(c.fill) ?? []), c]);
          }
          const days = y.cells.length - empty.length;
          const label =
            `${y.label}: ${num(y.drawings)} drawings on ${num(days)} school days` +
            (y.top ? `, most often ${y.top.theme.name}` : "");
          return (
            <div className="nb-cal-row" key={y.label}>
              <div className="nb-cal-label">
                <b>{y.label}</b>
                {y.top && (
                  <span>
                    <a href={`/?tag=${y.top.theme.slug}`}>{y.top.theme.name}</a>
                    <em>{num(y.top.count)}</em>
                  </span>
                )}
              </div>
              <svg className="nb-chart" viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label}>
                {y.months.map((m) => (
                  <text key={m.month} x={m.col * STEP} y={5} dy=".35em" className="nb-cal-m">
                    {INITIALS[m.month]}
                  </text>
                ))}
                {empty.length > 0 && <path d={outlinePath(empty)} fill="none" stroke={OUTLINE} strokeWidth={1} />}
                {[...byFill.entries()].map(([fill, cells]) => (
                  <path key={fill} d={filledPath(cells)} fill={fill} stroke={fill} strokeWidth={4} strokeLinejoin="round" />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
