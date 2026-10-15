import { num, type CastEntry } from "@/lib/stats";

/** The most-drawn characters, two columns on a desktop, numbered; the series sits in parentheses. */
export function Cast({ cast }: { cast: CastEntry[] }) {
  return (
    <ol className="nb-cast">
      {cast.map((c, i) => {
        const own = c.name === c.series;
        return (
          <li key={c.name}>
            <span className="nb-cast-n">{i + 1}</span>
            {own ? <a href={`/?tag=${c.seriesSlug}`}>{c.name}</a> : <b>{c.name}</b>}
            <span className="nb-cast-c">{num(c.count)}</span>
            {!own && (
              <span className="nb-cast-s">
                (<a href={`/?tag=${c.seriesSlug}`}>{c.series}</a>)
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
