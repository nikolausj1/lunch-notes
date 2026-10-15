export type LegendItem = {
  label: string;
  /** a filter slug: the label becomes a link to /?tag=<slug> */
  slug?: string | null;
  color?: string;
  /** how the swatch looks when it is not a plain color */
  swatch?: "outline" | "hatch" | "multi" | "muted";
};

/** A wrapping legend: a swatch and a label per item. */
export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={`nb-legend ${className ?? ""}`}>
      {items.map((it) => (
        <li key={it.label}>
          <i
            className={it.swatch ? `nb-sw-${it.swatch}` : undefined}
            style={it.color && !it.swatch ? { background: it.color } : undefined}
          />
          {it.slug ? <a href={`/?tag=${it.slug}`}>{it.label}</a> : it.label}
        </li>
      ))}
    </ul>
  );
}
