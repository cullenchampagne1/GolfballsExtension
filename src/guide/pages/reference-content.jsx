import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../../ui/index.js';
import { HELP_ARTICLES, HELP_TUTORIALS } from '../../lib/helpContent.js';

const PROGRESS_KEY = 'gbGuideTutorialProgress';
const TIER_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const TIER_ORDER = ['beginner', 'intermediate', 'advanced'];

const articleHref = (slug) => `#manual/${encodeURIComponent(slug)}`;
const tutorialHref = (id) => `#workflows/${encodeURIComponent(id)}`;

function Glyph({ name, size = 16 }) {
  const C = I[name] || I.bolt;
  return <C size={size} />;
}

function CalloutBlock({ block }) {
  const warning = block.kind === 'warning';
  const brand = ['tip', 'proTip', 'bestPractice'].includes(block.kind);
  const tone = warning ? 'warn' : brand ? 'brand' : 'info';
  const Icon = warning ? I.alert : brand ? I.bolt : I.eye;
  return (
    <div className={`docnote ${tone}`}>
      <span className="dn-ico"><Icon size={15} /></span>
      <div className="dn-b">
        <div className="dn-t">{block.title || (warning ? 'Watch for this' : brand ? 'Tip' : 'Good to know')}</div>
        <p>{block.text}</p>
      </div>
    </div>
  );
}

function ArticleBlock({ block }) {
  if (block.type === 'p') return <p>{block.text}</p>;
  if (block.type === 'heading') return <h3 className="sub">{block.text}</h3>;
  if (block.type === 'list') return <ul>{(block.items || []).map((item, i) => <li key={i}>{item}</li>)}</ul>;
  if (block.type === 'callout') return <CalloutBlock block={block} />;
  if (block.type === 'table') {
    return (
      <div className="reference-table-wrap gb-thin-scroll">
        <table className="spectable">
          <thead><tr>{(block.headers || []).map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{(block.rows || []).map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{ci === 0 ? <b>{cell}</b> : cell}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
  return null;
}

function Metadata({ article }) {
  return (
    <div className="reference-meta">
      {(article.tiers || []).map((tier) => <span className="reference-chip" key={tier}>{TIER_LABEL[tier] || tier}</span>)}
      {article.shortcut && <span className="reference-chip"><I.code size={11} /> {article.shortcut}</span>}
      {article.flag && <span className="reference-chip"><I.sliders size={11} /> {article.flag}</span>}
    </div>
  );
}

function ArticleDetail({ article }) {
  return (
    <div className="prose reference-detail">
      <a className="reference-back" href="#manual"><I.chevr size={11} style={{ transform: 'rotate(180deg)' }} /> Full reference</a>
      <div className="eyebrow">{article.sectionLabel}</div>
      <div className="reference-title-row">
        <span className="reference-title-icon"><Glyph name={article.icon} size={18} /></span>
        <h1 className="title">{article.title}</h1>
      </div>
      <p className="lede">{article.summary}</p>
      <Metadata article={article} />

      {TIER_ORDER.filter((tier) => article.body?.[tier]?.length).map((tier) => (
        <section className="reference-tier" key={tier}>
          <div className="reference-tier-label">{TIER_LABEL[tier]} reference</div>
          {article.body[tier].map((block, i) => <ArticleBlock block={block} key={`${tier}-${i}`} />)}
        </section>
      ))}

      {article.faq?.length > 0 && (
        <section>
          <h2 className="sec">Questions answered here</h2>
          <div className="reference-faq">
            {article.faq.map((item) => (
              <div className="reference-faq-row" key={item.q}><b>{item.q}</b><p>{item.a}</p></div>
            ))}
          </div>
        </section>
      )}

      {(article.tutorial || article.related?.length > 0) && (
        <section>
          <h2 className="sec">Keep going</h2>
          <div className="reference-links">
            {article.tutorial && <a href={tutorialHref(article.tutorial)}><I.play size={14} /> Follow the guided workflow</a>}
            {(article.related || []).map((slug) => {
              const related = HELP_ARTICLES.find((a) => a.slug === slug);
              return related ? <a href={articleHref(slug)} key={slug}><Glyph name={related.icon} size={14} /> {related.title}</a> : null;
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ArticleIndex() {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_ARTICLES;
    return HELP_ARTICLES.filter((a) => `${a.title} ${a.summary} ${(a.keywords || []).join(' ')}`.toLowerCase().includes(q));
  }, [query]);
  const sections = useMemo(() => {
    const map = new Map();
    for (const article of filtered) {
      if (!map.has(article.sectionLabel)) map.set(article.sectionLabel, []);
      map.get(article.sectionLabel).push(article);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="prose">
      <div className="eyebrow">Reference</div>
      <h1 className="title">Full Reference</h1>
      <p className="lede">Every authored feature article in one place. Use it as a refresher, or search for the exact control, setting, shortcut, or workflow you need.</p>
      <div className="reference-search">
        <I.search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${HELP_ARTICLES.length} articles…`} />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><I.close size={12} /></button>}
      </div>
      {sections.length === 0 && <div className="reference-empty">No reference articles match “{query}”.</div>}
      {sections.map(([section, articles]) => (
        <section className="reference-section" key={section}>
          <h2 className="sec">{section}</h2>
          <div className="reference-card-grid">
            {articles.map((article) => (
              <a className="reference-card" href={articleHref(article.slug)} key={article.slug}>
                <span className="reference-card-icon"><Glyph name={article.icon} /></span>
                <span className="reference-card-copy">
                  <b>{article.title}</b>
                  <span>{article.summary}</span>
                </span>
                <I.chevr size={13} />
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ManualPage({ itemId }) {
  const article = itemId ? HELP_ARTICLES.find((a) => a.slug === itemId) : null;
  if (itemId && !article) {
    return <div className="prose"><h1 className="title">Article not found</h1><p>The requested reference article is not in this build.</p><a href="#manual">Return to the full reference</a></div>;
  }
  return article ? <ArticleDetail article={article} /> : <ArticleIndex />;
}

function readProgress() {
  return new Promise((resolve) => {
    try {
      if (chrome?.storage?.local) {
        chrome.storage.local.get(PROGRESS_KEY, (data) => resolve(data?.[PROGRESS_KEY] || {}));
        return;
      }
    } catch { /* localStorage fallback below */ }
    try { resolve(JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')); } catch { resolve({}); }
  });
}

function writeProgress(progress) {
  try {
    if (chrome?.storage?.local) { chrome.storage.local.set({ [PROGRESS_KEY]: progress }); return; }
  } catch { /* localStorage fallback below */ }
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

function WorkflowIndex({ progress }) {
  return (
    <div className="prose">
      <div className="eyebrow">Learn, then look it up later</div>
      <h1 className="title">Guided Workflows</h1>
      <p className="lede">Follow a task from start to finish the first time, then return to the same checklist whenever you need a refresher. Progress is optional and stays in this browser.</p>
      {TIER_ORDER.map((tier) => {
        const rows = HELP_TUTORIALS.filter((t) => t.tier === tier);
        if (!rows.length) return null;
        return (
          <section className="reference-section" key={tier}>
            <h2 className="sec">{TIER_LABEL[tier]}</h2>
            <div className="workflow-card-grid">
              {rows.map((tutorial) => {
                const complete = (progress[tutorial.id] || []).length;
                const pct = tutorial.steps.length ? Math.round((complete / tutorial.steps.length) * 100) : 0;
                return (
                  <a className="workflow-card" href={tutorialHref(tutorial.id)} key={tutorial.id}>
                    <span className="workflow-card-top"><b>{tutorial.title}</b><span>~{tutorial.estMinutes} min</span></span>
                    <span className="workflow-card-sub">{tutorial.steps.length} steps · {complete ? `${complete} checked` : 'not started'}</span>
                    <span className="workflow-progress"><span style={{ width: `${pct}%` }} /></span>
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WorkflowDetail({ tutorial, checked, onToggle, onReset }) {
  const done = checked.length;
  return (
    <div className="prose workflow-detail">
      <a className="reference-back" href="#workflows"><I.chevr size={11} style={{ transform: 'rotate(180deg)' }} /> All workflows</a>
      <div className="eyebrow">{TIER_LABEL[tutorial.tier]} workflow · ~{tutorial.estMinutes} min</div>
      <h1 className="title">{tutorial.title}</h1>
      <div className="workflow-summary">
        <span>{done} of {tutorial.steps.length} checked</span>
        <span className="workflow-progress"><span style={{ width: `${tutorial.steps.length ? (done / tutorial.steps.length) * 100 : 0}%` }} /></span>
        {done > 0 && <button type="button" onClick={onReset}>Reset</button>}
      </div>
      {tutorial.prerequisites?.length > 0 && (
        <div className="docnote info">
          <span className="dn-ico"><I.check size={15} /></span>
          <div className="dn-b"><div className="dn-t">Before you start</div><ul>{tutorial.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></div>
        </div>
      )}
      <ol className="workflow-steps">
        {tutorial.steps.map((step, index) => {
          const isDone = checked.includes(index);
          return (
            <li className={isDone ? 'done' : ''} key={index}>
              <button className="workflow-check" type="button" aria-pressed={isDone} onClick={() => onToggle(index)}>
                {isDone ? <I.check size={14} /> : <span>{index + 1}</span>}
              </button>
              <div className="workflow-step-copy">
                <h2>{step.action}</h2>
                <div className="workflow-expected"><b>Expected</b><span>{step.expected}</span></div>
                {step.visualCue && <div className="workflow-note"><I.eye size={13} /><span><b>Look for:</b> {step.visualCue}</span></div>}
                {step.tip && <div className="workflow-note tip"><I.bolt size={13} /><span><b>Tip:</b> {step.tip}</span></div>}
                {step.warning && <div className="workflow-note warn"><I.alert size={13} /><span><b>Warning:</b> {step.warning}</span></div>}
                {step.commonMistake && <div className="workflow-note warn"><I.alert size={13} /><span><b>Common mistake:</b> {step.commonMistake}</span></div>}
              </div>
            </li>
          );
        })}
      </ol>
      {tutorial.related?.length > 0 && (
        <section><h2 className="sec">Reference while you work</h2><div className="reference-links">
          {tutorial.related.map((slug) => {
            const article = HELP_ARTICLES.find((a) => a.slug === slug);
            return article ? <a href={articleHref(slug)} key={slug}><Glyph name={article.icon} size={14} /> {article.title}</a> : null;
          })}
        </div></section>
      )}
    </div>
  );
}

export function WorkflowsPage({ itemId }) {
  const [progress, setProgress] = useState({});
  useEffect(() => { let alive = true; readProgress().then((value) => { if (alive) setProgress(value); }); return () => { alive = false; }; }, []);
  const tutorial = itemId ? HELP_TUTORIALS.find((t) => t.id === itemId) : null;
  if (itemId && !tutorial) {
    return <div className="prose"><h1 className="title">Workflow not found</h1><p>The requested workflow is not in this build.</p><a href="#workflows">Return to guided workflows</a></div>;
  }
  if (!tutorial) return <WorkflowIndex progress={progress} />;
  const checked = Array.isArray(progress[tutorial.id]) ? progress[tutorial.id] : [];
  const update = (next) => { setProgress(next); writeProgress(next); };
  const toggle = (index) => {
    const nextChecked = checked.includes(index) ? checked.filter((i) => i !== index) : [...checked, index].sort((a, b) => a - b);
    update({ ...progress, [tutorial.id]: nextChecked });
  };
  const reset = () => update({ ...progress, [tutorial.id]: [] });
  return <WorkflowDetail tutorial={tutorial} checked={checked} onToggle={toggle} onReset={reset} />;
}
