import React from 'react';
import { I } from '../../ui/index.js';
import { getArticle } from '../../lib/helpContent.js';
import { NAV } from '../lib/app.jsx';

/* ───────────────────────────────────────────────────────────────
   article-page.jsx — a generic page that renders one or more
   verified help articles (from src/lib/helpContent.js, the
   build-help-content manual) in the guide's prose theme. Every
   nav route that doesn't have a bespoke live-stage page renders
   through here, so the whole help menu is complete and identically
   themed — no placeholders, no guesswork. Block types mirror the
   authored content: p · heading · list · table · callout, across
   the beginner → intermediate → advanced tiers.
─────────────────────────────────────────────────────────────── */

const TIERS = ['beginner', 'intermediate', 'advanced'];

/* nav lookups (lazy — NAV is a live binding from app.jsx, populated
   by the time any component renders, so the import cycle is safe). */
const flatNav = () => NAV.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
const navById = (id) => flatNav().find((x) => x.id === id) || null;
/* slug → guide route, so a "Related" card lands on the right page. */
function routeForSlug() {
  const map = {};
  for (const it of flatNav()) for (const s of it.slugs || []) if (!map[s]) map[s] = it.id;
  return map;
}

function Blocks({ blocks }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{b.text}</p>;
        if (b.type === 'heading') return <h3 className="sub" key={i}>{b.text}</h3>;
        if (b.type === 'list') return <ul key={i}>{(b.items || []).map((it, j) => <li key={j}>{it}</li>)}</ul>;
        if (b.type === 'callout') {
          const kind = b.kind === 'warning' || b.kind === 'warn' ? 'warn' : b.kind === 'brand' ? 'brand' : 'info';
          const Ico = kind === 'warn' ? I.alert : I.bolt;
          return (
            <div className={`docnote ${kind}`} key={i}>
              <span className="dn-ico"><Ico size={15} /></span>
              <div className="dn-b"><p style={{ margin: 0 }}>{b.text}</p></div>
            </div>
          );
        }
        if (b.type === 'table') {
          return (
            <table className="spectable" key={i}>
              <thead><tr>{(b.headers || []).map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
              <tbody>
                {(b.rows || []).map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          );
        }
        return null;
      })}
    </>
  );
}

/* One article rendered as a section. `lead` = the top article on the
   page (its summary already shows as the page lede, so it's omitted
   here and its title is skipped — the page <h1> covers it). */
function ArticleSection({ slug, lead, single }) {
  const a = getArticle(slug);
  if (!a) return null;
  const blocks = TIERS.flatMap((t) => (a.body && a.body[t]) || []);
  const faq = Array.isArray(a.faq) ? a.faq : [];
  return (
    <>
      {!single && !lead && <h2 className="sec">{a.title}</h2>}
      {!single && !lead && a.summary && (
        <p style={{ color: 'var(--gb-text-muted)', fontStyle: 'italic', marginTop: -2 }}>{a.summary}</p>
      )}
      <Blocks blocks={blocks} />
      {faq.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--gb-border-subtle)' }}>
          {faq.map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--gb-border-subtle)', padding: '16px 2px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 7 }}>{f.q}</div>
              <p style={{ margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Related({ slugs, excl }) {
  const map = routeForSlug();
  const seen = new Set(excl);
  const cards = [];
  for (const s of slugs) {
    const route = map[s];
    const a = getArticle(s);
    if (!route || !a || seen.has(s)) continue;
    seen.add(s);
    cards.push({ route, title: a.title, desc: a.summary });
  }
  if (!cards.length) return null;
  return (
    <>
      <h2 className="sec">Related</h2>
      <div className="cardgrid">
        {cards.map((c) => (
          <button key={c.route + c.title} className="featurecard" onClick={() => { window.location.hash = '#' + c.route; }}>
            <span className="fc-ico"><I.bookmark size={17} /></span>
            <span className="fc-t">{c.title}</span>
            <span className="fc-d">{c.desc}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* The page for a nav route: header + every article the route covers,
   plus a Related grid built from the articles' own `related` lists. */
export function ArticlePage({ id }) {
  const nav = navById(id);
  const slugs = (nav?.slugs || []).filter((s) => getArticle(s));
  const single = slugs.length === 1;
  const lede = slugs.length ? getArticle(slugs[0])?.summary : '';

  // Collect related slugs that point OUTSIDE this page's own articles.
  const own = new Set(slugs);
  const related = [];
  for (const s of slugs) for (const r of (getArticle(s)?.related || [])) if (!own.has(r) && !related.includes(r)) related.push(r);

  return (
    <div className="prose">
      <div className="eyebrow">{nav?.group}</div>
      <h1 className="title">{nav?.title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {slugs.length === 0 && (
        <p>Documentation for this section is being finalized.</p>
      )}
      {slugs.map((s, i) => <ArticleSection key={s} slug={s} lead={i === 0} single={single} />)}
      <Related slugs={related} excl={own} />
    </div>
  );
}

/* Factory so pages/index.jsx can register a route in one line. */
export const makeArticlePage = (id) => function BoundArticlePage() { return <ArticlePage id={id} />; };
