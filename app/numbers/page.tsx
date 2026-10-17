import type { Metadata } from "next";
import Link from "next/link";
import "./numbers.css";
import { getDrawings } from "@/lib/drawings";
import { NO_THEME_COLOR, computeLifespans, computeStats, monthYear, num } from "@/lib/stats";
import { Calendar } from "@/components/numbers/Calendar";
import { Cast } from "@/components/numbers/Cast";
import { GroupBars } from "@/components/numbers/GroupBars";
import { Legend, type LegendItem } from "@/components/numbers/Legend";
import { Lifespans } from "@/components/numbers/Lifespans";
import { Treemap } from "@/components/numbers/Treemap";

/**
 * "By the numbers": a fully static stats page for the whole archive. It is about
 * what the drawings were of (series, subjects, eras, streaks), never about which
 * boy drew what. Every number is computed from the drawings at build time.
 */

const TITLE = "By the numbers · Lunch Box Drawings";
const COUNT = getDrawings().length;
const ROUGH = COUNT >= 1000 ? `${num(Math.floor(COUNT / 1000) * 1000)}+` : num(COUNT);
const DESCRIPTION = `What ${ROUGH} lunchbox drawings were about: series, eras, and every school day.`;

// A page-level openGraph / twitter object replaces the layout's whole object, image
// included, so the site's share cards (app/opengraph-image.png, app/twitter-image.png)
// are named again here.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/numbers",
    siteName: "Lunch Box Drawings",
    type: "website",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/twitter-image.png"] },
};

/**
 * Honor the desk color this device picked on the main page (localStorage
 * "lbd-desk-color") before first paint. Same rule as BackgroundPicker: a desk
 * under 0.45 relative luminance counts as dark. The script sits inside <main>
 * and styles its parent: setting attributes on <html> before hydration would
 * trip React's dev hydration warning (the root layout does not suppress it),
 * while <main suppressHydrationWarning> takes them quietly.
 */
const DESK_SCRIPT =
  '(function(){try{var c=localStorage.getItem("lbd-desk-color");if(!c||!/^#[0-9a-f]{6}$/i.test(c))return;' +
  "var s=document.currentScript,m=s&&s.parentElement;if(!m)return;m.style.setProperty(\"--desk\",c);" +
  "var n=parseInt(c.slice(1),16),f=function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};" +
  "var l=.2126*f(n>>16&255)+.7152*f(n>>8&255)+.0722*f(n&255);" +
  'if(l<.45)m.setAttribute("data-desk-dark","true")}catch(e){}})()';

const tag = (slug: string) => `/?tag=${slug}`;

export default function NumbersPage() {
  const s = computeStats(getDrawings());
  const { partition: p, streak, biggestSeries: top, calendar: cal } = s;

  // the subtitle only ever wraps between its parts, never inside "Sept 2019"
  const subtitle = [
    `${num(s.total)} drawings`,
    `${num(s.seriesCount)} series`,
    `${num(s.schoolDays)} school days`,
    `${monthYear(s.first)} to ${monthYear(s.last)}`,
  ];

  const treemapLegend: LegendItem[] = [
    { label: "a series, grouped by kind", swatch: "multi" },
    { label: "a subject with no series", swatch: "muted" },
    { label: "no theme", color: NO_THEME_COLOR },
    { label: "characters still to place", swatch: "hatch" },
  ];

  const otherSeries = Math.max(s.seriesCount - cal.legendSeries.length, 0);
  const calendarLegend: LegendItem[] = [
    ...cal.legendSeries.map((t) => ({ label: t.name, slug: t.slug, color: t.color })),
    ...(otherSeries > 0 ? [{ label: `${otherSeries} other series`, swatch: "multi" as const }] : []),
    ...cal.legendSubjects.map((t) => ({ label: t.name, slug: t.slug, color: t.color })),
    { label: "no theme", color: NO_THEME_COLOR },
    { label: "no drawing", swatch: "outline" },
  ];

  // Lifespans colors every row by its series, so the legend names the biggest few (as the calendar's does)
  // and folds the rest into one item
  const lifespans = computeLifespans(getDrawings());
  const lifespanNamed = [...lifespans.rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 10);
  const lifespanOther = lifespans.rows.length - lifespanNamed.length;
  const lifespansLegend: LegendItem[] = [
    ...lifespanNamed.map((r) => ({ label: r.name, slug: r.slug, color: r.color })),
    ...(lifespanOther > 0 ? [{ label: `${lifespanOther} other series`, swatch: "multi" as const }] : []),
  ];

  return (
    <>
      <main className="numbers" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: DESK_SCRIPT }} />
        <div className="numbers-wrap">
          <Link className="numbers-back" href="/" prefetch={false}>
            ← Lunch Box Drawings
          </Link>

          <article className="numbers-sheet">
            <h1>By the numbers</h1>
            <p className="numbers-sub">
              {subtitle.map((part, i) => (
                <span key={part}>
                  {i > 0 && " · "}
                  <span className="nb-nowrap">{part}</span>
                </span>
              ))}
            </p>

            <section className="nb-sec">
              <div className="nb-sec-h">
                <h2>Lifespans</h2>
                <span>
                  the {lifespans.rows.length} biggest series, oldest first; a cell is a month, darker means more drawings
                </span>
              </div>
              <p className="nb-cal-hint">Swipe sideways to follow the months.</p>
              <Lifespans data={lifespans} />
              <Legend items={lifespansLegend} />
            </section>

            <div className="numbers-tiles">
              <div className="nb-tile">
                <b>{num(s.videoGameDrawings)}</b>
                <span>drawings in a video-game series</span>
              </div>
              {top && (
                <div className="nb-tile">
                  <b>{num(top.count)}</b>
                  <span>
                    <a href={tag(top.slug ?? "")}>{top.name}</a> alone
                  </span>
                </div>
              )}
              {streak && (
                <div className="nb-tile">
                  <b>{num(streak.length)}</b>
                  <span>
                    longest streak: <a href={tag(streak.theme.slug)}>{streak.theme.name}</a>, {streak.season}
                  </span>
                </div>
              )}
            </div>

            <section className="nb-sec">
              <div className="nb-sec-h">
                <h2>Everything, by what it is</h2>
                <span>area = drawings; colored by series or subject, hatched is still to place</span>
              </div>
              <Treemap partition={p} w={820} h={470} id="wide" className="nb-only-wide" />
              <Treemap partition={p} w={340} h={620} id="narrow" className="nb-only-narrow" />
              <Legend items={treemapLegend} />
            </section>

            <section className="nb-sec nb-sec-tight" aria-label="What is inside the biggest groups">
              <GroupBars bars={s.bars} w={820} className="nb-only-wide" />
              <GroupBars bars={s.bars} w={340} className="nb-only-narrow" />
            </section>

            <section className="nb-sec nb-sec-tight">
              <div className="nb-sec-h">
                <h2>Cast list</h2>
                <span>the most-drawn characters, counted from titles</span>
              </div>
              <Cast cast={s.cast} />
            </section>

            <section className="nb-sec">
              <div className="nb-sec-h">
                <h2>Every school day</h2>
                <span>one block per school year, August to July; a column is a week, Monday to Friday</span>
              </div>
              <p className="nb-cal-hint">Swipe sideways to see the whole year.</p>
              <Calendar years={cal.years} />
              <Legend items={calendarLegend} />
              <p className="nb-note">
                A solid week of one color is a theme week. {num(cal.weekendDrawings)} drawings made on a weekend are not shown.
              </p>
            </section>

            <p className="numbers-foot">
              Series come from tags plus title matching: {num(p.assigned)} drawings have one, {num(p.plain)} are plain subjects, and{" "}
              {num(p.gap)} still need a look.
            </p>
          </article>

          <Link className="numbers-end" href="/" prefetch={false}>
            ← back to the drawings
          </Link>
        </div>
      </main>
    </>
  );
}
