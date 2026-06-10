import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { HELP_TREE, HELP_CONTENT, getArticle, getTutorial } from '../../lib/helpContent.js';
import { DocsSidebar } from './DocsSidebar.jsx';
import { DocsArticle } from './DocsArticle.jsx';
import { DocsBreadcrumbs } from './DocsBreadcrumbs.jsx';
import { TutorialView } from './TutorialView.jsx';

/* ───────────────────────────────────────────────────────────────
   HelpPage.jsx — root of the in-app Help & Training view.

   Layout: sticky nav column (DocsSidebar) + scrolling content
   column (breadcrumbs + DocsArticle / TutorialView). All content
   comes from the generated src/lib/helpContent.js module.

   Deep links: registers window.__gbHelpNavigate(slugOrId) so the
   editor bridge's openHelp('some-article') can route here, and so
   modals can later link straight to their own docs.

   Phase 3 adds DocsSearch (⌘F palette) and the interactive
   TutorialPlayer on top of this shell.
─────────────────────────────────────────────────────────────── */

const HOME = { article: 'what-this-extension-does' };
const SOFT = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

/* Hover style for nav rows — plain CSS so :hover never fights the
   active tint (same pattern as the template sidebar). */
const HOVER_STYLE_ID = '__gb-help-hover';
function ensureHoverStyle() {
  if (typeof document === 'undefined' || document.getElementById(HOVER_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = HOVER_STYLE_ID;
  el.textContent = '.gb-help-row:hover { background-color: var(--gb-fill-soft) !important; }';
  (document.head || document.documentElement).appendChild(el);
}

/** Map every tree item to its breadcrumb path: [section, group?, title]. */
function buildPaths() {
  const paths = new Map();
  for (const section of HELP_TREE) {
    for (const item of section.items || []) {
      paths.set(JSON.stringify(item), [section.title]);
    }
    for (const group of section.groups || []) {
      for (const item of group.items || []) {
        paths.set(JSON.stringify(item), [section.title, group.title]);
      }
    }
  }
  return paths;
}

export function HelpPage({ initialArticle }) {
  const [active, setActive] = useState(() => {
    if (initialArticle && getArticle(initialArticle)) return { article: initialArticle };
    if (initialArticle && getTutorial(initialArticle)) return { tutorial: initialArticle };
    return HOME;
  });
  useEffect(() => { ensureHoverStyle(); }, []);

  const paths = useMemo(buildPaths, []);

  // Deep-link hook for the bridge (?view=help&article=…) and, later,
  // per-modal "?" buttons. Accepts an article slug or tutorial id.
  useEffect(() => {
    window.__gbHelpNavigate = (ref) => {
      if (!ref) return;
      if (getArticle(ref)) setActive({ article: ref });
      else if (getTutorial(ref)) setActive({ tutorial: ref });
    };
    return () => { delete window.__gbHelpNavigate; };
  }, []);

  const record = active.article ? getArticle(active.article) : getTutorial(active.tutorial);
  const title = active.article ? record?.title : record?.title;

  const labelFor = (item) => item.article
    ? (getArticle(item.article)?.title || item.article)
    : (getTutorial(item.tutorial)?.title || item.tutorial);
  const iconFor = (item) => item.article ? getArticle(item.article)?.icon : null;

  const path = useMemo(() => {
    const base = paths.get(JSON.stringify(active)) || [];
    return [...base, title].filter(Boolean);
  }, [active, paths, title]);

  const navigate = (ref) => {
    if (ref.article && getArticle(ref.article)) setActive({ article: ref.article });
    else if (ref.tutorial && getTutorial(ref.tutorial)) setActive({ tutorial: ref.tutorial });
  };

  const getArticleMeta = (slug) => {
    const a = getArticle(slug);
    return a ? { title: a.title, icon: a.icon } : null;
  };

  const activeKey = active.article ? `a:${active.article}` : `t:${active.tutorial}`;

  return (
    <div style={{
      display: 'flex', gap: 24, alignItems: 'flex-start',
      fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)',
    }}>

      {/* Nav column — sticky inside #editor's scroll context */}
      <div className="gb-thin-scroll" style={{
        width: 215, flexShrink: 0,
        position: 'sticky', top: 12,
        maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
        paddingRight: 4,
      }}>
        <div style={{ marginBottom: 10, padding: '0 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>
            Help &amp; Training
          </div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>
            v{HELP_CONTENT.version} · {HELP_CONTENT.articles.length} articles
          </div>
        </div>
        <DocsSidebar
          tree={HELP_TREE}
          active={active}
          labelFor={labelFor}
          iconFor={iconFor}
          onSelect={navigate}
        />
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 40 }}>
        <DocsBreadcrumbs path={path} onHome={() => setActive(HOME)} />
        {/* Keyed remount = fresh enter animation per navigation. No
            AnimatePresence exit dance — its mode="wait" handoff stalled
            in the multi-root editor page, leaving the old article stuck
            on screen. */}
        <motion.div
          key={activeKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SOFT}
        >
          {active.article
            ? <DocsArticle article={record} getArticleMeta={getArticleMeta} onNavigate={navigate} />
            : <TutorialView tutorial={record} getArticleMeta={getArticleMeta} onNavigate={navigate} />}
        </motion.div>
      </div>
    </div>
  );
}
