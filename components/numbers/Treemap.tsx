import { num, type Partition } from "@/lib/stats";
import { PAPER, layoutTreemap, type LabelPlan, type TreemapCell } from "./layout";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** the name (a link when the cell is) and its count, laid out by planCellLabel */
function CellLabel({ plan, on, link }: { plan: LabelPlan; on: "w" | "i"; link: boolean }) {
  const nameClass = link ? `nb-lk nb-lk-${on}` : "nb-tm-plain";
  const countClass = `nb-tm-count nb-tm-count-${on}`;
  const [first, ...more] = plan.lines;
  return (
    <>
      <text x={r1(first.x)} y={r1(first.y)} dy=".35em" className="nb-tm-name">
        <tspan className={nameClass}>{first.text}</tspan>
        {plan.count?.inline && (
          <tspan dx={5} className={countClass}>
            {plan.count.text}
          </tspan>
        )}
      </text>
      {more.map((l) => (
        <text key={l.y} x={r1(l.x)} y={r1(l.y)} dy=".35em" className="nb-tm-name">
          <tspan className={nameClass}>{l.text}</tspan>
        </text>
      ))}
      {plan.count && !plan.count.inline && (
        <text x={r1(plan.count.x)} y={r1(plan.count.y)} dy=".35em" className={`nb-tm-name ${countClass}`}>
          {plan.count.text}
        </text>
      )}
    </>
  );
}

function Cell({ c }: { c: TreemapCell }) {
  const tip = `${c.name}, ${num(c.count)} ${c.count === 1 ? "drawing" : "drawings"}${c.group ? ` (${c.group})` : ""}`;
  const body = (
    <>
      <title>{tip}</title>
      <rect x={r1(c.rect.x)} y={r1(c.rect.y)} width={r1(c.rect.w)} height={r1(c.rect.h)} fill={c.color} />
      {c.groupTag && (
        <text x={r1(c.groupTag.x)} y={r1(c.groupTag.y)} dy=".35em" className={`nb-tm-grouptag nb-tm-count-${c.on}`}>
          {c.groupTag.text}
        </text>
      )}
      {c.label && <CellLabel plan={c.label} on={c.on} link={c.slug !== null} />}
    </>
  );
  return c.slug ? (
    <a className="nb-tm-cell" href={`/?tag=${c.slug}`}>
      {body}
    </a>
  ) : (
    <g className="nb-tm-cell">{body}</g>
  );
}

/**
 * Every drawing as an area. Series sit inside their group (video games, films
 * and shows, books...) in their own colors; drawings with no series are grouped
 * by subject theme in muted colors; the few with no theme are warm grey; and the
 * hatched cell is the characters nobody has placed in a series yet.
 *
 * `w` x `h` is the SVG's own coordinate space (it scales to the container), so a
 * phone gets a taller, narrower layout and the 11px labels stay 11px-ish.
 */
export function Treemap({ partition, w, h, id, className }: { partition: Partition; w: number; h: number; id: string; className?: string }) {
  const geo = layoutTreemap(partition, w, h);
  const hatchId = `numbers-hatch-${id}`;
  const { gap } = geo;
  const label =
    `Treemap of all ${num(partition.total)} drawings: ${num(partition.assigned)} in a series, ` +
    `${num(partition.plain)} plain subjects, and ${num(partition.gap)} characters still to place`;
  return (
    <svg className={`nb-chart nb-tm ${className ?? ""}`} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={label}>
      <defs>
        <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="#f3efe3" />
          <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(63,58,49,.25)" strokeWidth={2} />
        </pattern>
      </defs>
      {geo.cells.map((c) => (
        <Cell key={c.key} c={c} />
      ))}
      {geo.groups.map(
        (g) =>
          g.header && (
            <text key={g.name} x={r1(g.header.x)} y={r1(g.header.y)} dy=".35em">
              <tspan className="nb-tm-gname">{g.name}</tspan>
              <tspan dx={6} className="nb-tm-gtotal">
                {num(g.total)}
              </tspan>
            </text>
          )
      )}
      <g className="nb-tm-gap">
        <title>{`${num(partition.gap)} drawings of characters, films and games that are not in a series yet`}</title>
        <rect
          x={r1(gap.rect.x)}
          y={r1(gap.rect.y)}
          width={r1(gap.rect.w)}
          height={r1(gap.rect.h)}
          fill={`url(#${hatchId})`}
          stroke="rgba(63,58,49,.25)"
          strokeWidth={1}
        />
        {gap.pill && (
          <>
            <rect x={r1(gap.pill.x)} y={r1(gap.pill.y)} width={r1(gap.pill.w)} height={19} rx={9.5} fill={PAPER} fillOpacity={0.92} />
            <text x={r1(gap.pill.x + 7)} y={r1(gap.pill.y + 9.5)} dy=".35em" className="nb-tm-pill">
              {gap.pill.text}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
