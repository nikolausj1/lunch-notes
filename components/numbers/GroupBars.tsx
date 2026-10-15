import { num, type GroupBar } from "@/lib/stats";
import { PAPER, inkOn, layoutBar } from "./layout";

const BAR_H = 28;

function Bar({ bar, w }: { bar: GroupBar; w: number }) {
  const { segments, rest } = layoutBar(bar.cells, bar.total, w);
  const label = `${bar.title}: ${bar.cells.map((c) => `${c.name} ${c.count}`).join(", ")}`;
  return (
    <div className="nb-gbar">
      <div className="nb-gbar-h">
        <h3>{bar.title}</h3>
        <span>
          {num(bar.total)} drawings in {bar.cells.length} series
        </span>
      </div>
      <svg className="nb-chart" viewBox={`0 0 ${w} ${BAR_H}`} role="group" aria-label={label}>
        {segments.map(({ cell, x, w: sw, inline }) => {
          const on = inkOn(cell.color);
          return (
            <a key={cell.name} className="nb-tm-cell" href={`/?tag=${cell.slug}`}>
              <title>{`${cell.name}, ${num(cell.count)} ${cell.count === 1 ? "drawing" : "drawings"}`}</title>
              <rect x={Math.round(x * 10) / 10} y={0} width={Math.round(sw * 10) / 10} height={BAR_H} fill={cell.color} stroke={PAPER} strokeWidth={1} />
              {inline && (
                <text x={Math.round((x + 6) * 10) / 10} y={BAR_H / 2} dy=".35em" className="nb-tm-name">
                  <tspan className={`nb-lk nb-lk-${on}`}>{cell.name}</tspan>
                  <tspan dx={5} className={`nb-tm-count nb-tm-count-${on}`}>
                    {cell.count}
                  </tspan>
                </text>
              )}
            </a>
          );
        })}
      </svg>
      {rest.length > 0 && (
        <ul className="nb-legend nb-gbar-rest">
          {rest.map((c) => (
            <li key={c.name}>
              <i style={{ background: c.color }} />
              <a href={`/?tag=${c.slug}`}>{c.name}</a> {c.count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Stacked bars for the biggest series groups: what is inside video games, films and shows, books. */
export function GroupBars({ bars, w, className }: { bars: GroupBar[]; w: number; className?: string }) {
  return (
    <div className={className}>
      {bars.map((b) => (
        <Bar key={b.group} bar={b} w={w} />
      ))}
    </div>
  );
}
