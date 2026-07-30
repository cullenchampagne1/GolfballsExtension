import React from 'react';
import { I } from '../../ui/index.js';
import { GIcon } from '../lib/app.jsx';

/* ───────────────────────────────────────────────────────────────
   start.jsx — Getting Started. Layout ported from the design's
   page-getting-started.jsx; copy rewritten from the verified
   articles (what-this-extension-does, first-launch,
   initial-configuration, actions-shelf, keyboard-shortcuts).
─────────────────────────────────────────────────────────────── */

function FeatureCard({ icon, title, desc, go }) {
  return (
    <button className="featurecard" onClick={() => { window.location.hash = go; }}>
      <span className="fc-ico">{icon}</span>
      <span className="fc-t">{title}</span>
      <span className="fc-d">{desc}</span>
    </button>
  );
}

export function StartPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Golfballs.com Browser Extension</div>
      <h1 className="title">Everything the extension does, shown live.</h1>
      <p className="lede">
        This is the operator's manual for the Golfballs.com Chrome extension — the toolkit that layers
        email templates, charging, CRM lookups, tasks, proofs, a full product catalog, and workflow
        tools on top of the admin site. Nothing about the CRM itself changes: the extension watches
        which page you're on and offers the right tools for it.
      </p>

      <div className="docnote brand">
        <span className="dn-ico"><I.bolt size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Where the extension lives</div>
          <p>
            There's no separate app to open. After installing, the extension shows up in four places:
            the <strong>popup</strong> (click the toolbar icon — templates and quick actions for the current
            page), the <strong>Actions Shelf</strong> (a floating pill in the bottom-right of every CRM page —
            double-tap <span className="kbd">Shift</span> to toggle it), <strong>injected buttons</strong> (hover an
            email row for a thread preview, hover an order image for the Image Viewer), and the
            <strong> order-notes toolbar</strong> (one-click notes and the order-date calendar).
          </p>
          <p style={{ margin: 0 }}>
            Interactive examples reuse production components where practical and otherwise provide a
            faithful sample-data reproduction. Use the new workflows for an end-to-end checklist and
            the full reference when you need to look up one control. Nothing you do here touches a real order.
          </p>
        </div>
      </div>

      <h2 className="sec">Three ways to learn each screen</h2>
      <div className="cardgrid">
        <div className="featurecard" style={{ cursor: 'default' }}>
          <span className="fc-ico"><GIcon.grid size={17} /></span>
          <span className="fc-t">Tour</span>
          <span className="fc-d">Numbered hotspots pin every control. Hover a pin or a legend row to highlight what it points at. Best for "what is this button?"</span>
        </div>
        <div className="featurecard" style={{ cursor: 'default' }}>
          <span className="fc-ico"><I.play size={17} /></span>
          <span className="fc-t">Play walkthrough</span>
          <span className="fc-d">Press play and the screen operates itself — cursor moves, menus open, fields fill — with a caption for each step. Pause or reset anytime.</span>
        </div>
        <div className="featurecard" style={{ cursor: 'default' }}>
          <span className="fc-ico"><GIcon.cube size={17} /></span>
          <span className="fc-t">Try it</span>
          <span className="fc-d">Hands on the wheel. The live UI is yours to click — wired to sample data, so nothing here can touch a real order. Reset to start fresh.</span>
        </div>
      </div>

      <h2 className="sec">First five minutes</h2>
      <p>Worth doing on day one, all in <a href="#settings">Settings</a> (popup → Manage in the header → Settings):</p>
      <ul>
        <li><strong>Pick a theme</strong> — Dark, Slate, Light, Cream, Nord, Dracula, Rosé, or Tokyo Night. Applies live everywhere (including this guide — try the switcher top-right).</li>
        <li><strong>Set your email identity</strong> — the "Email account host" field controls your From address. It starts blank and Power Automate sends are blocked until you configure it.</li>
        <li><strong>Write your signature</strong> — auto-appended to emails sent through Power Automate.</li>
        <li><strong>Review the feature toggles</strong> — everything is on by default except Power Automate. Off means the buttons, shortcuts, and shelf actions disappear entirely.</li>
        <li><strong>Open a team settings link</strong> — paste a teammate’s URL under Shared Settings Templates, preview its contents, then choose exactly which scopes to import.</li>
      </ul>

      <h2 className="sec">Start here</h2>
      <p>New to the extension? Read these in order. Each is a full page with the live UI and a walkthrough.</p>
      <div className="cardgrid">
        <FeatureCard icon={<I.mail size={17} />} title="The Popup" desc="Your home base — opens from the toolbar icon. Matched templates, live variables, charge, watch, tasks, proofs." go="#popup" />
        <FeatureCard icon={<I.cog size={17} />} title="Settings & Manager" desc="Every toggle explained: features, theme, shortcuts, UI scale, shared templates, integrations." go="#settings" />
        <FeatureCard icon={<I.edit size={17} />} title="Email Templates" desc="Templates with variables that fill from the live page — schema, code, regex sources, and A/B variations." go="#templates" />
        <FeatureCard icon={<GIcon.gift size={17} />} title="Gift Catalog" desc="Browse the full product range, customize with logos and monograms, and build tracked proposals." go="#catalog" />
        <FeatureCard icon={<I.play size={17} />} title="Guided Workflows" desc="End-to-end checklists that double as refreshers; optional progress stays in this browser." go="#workflows" />
        <FeatureCard icon={<I.bookmark size={17} />} title="Full Reference" desc="Every authored article, setting, shortcut, and troubleshooting note with exact deep links." go="#manual" />
      </div>

      <h2 className="sec">The full toolkit</h2>
      <p>Everything the extension adds, grouped the way the sidebar groups it.</p>
      <ul>
        <li><strong>Daily driver</strong> — the Popup, Email Templates, Charge / Refund &amp; Order Edit, Submit Proof.</li>
        <li><strong>Stay organized</strong> — Watch List, Task List, Quick Task, Call Log, Order Dates.</li>
        <li><strong>Find people</strong> — CRM Search (<span className="kbd">Ctrl+K</span>), Query Builder, New Contact (<span className="kbd">Ctrl+Q</span>), Phone Finder.</li>
        <li><strong>On-page helpers</strong> — Email/Chat Viewer, Image Viewer &amp; logo extraction, 3D Product Viewer, Margin Calculator (<span className="kbd">Ctrl+M</span>), Copy Order IDs, Signifyd glow.</li>
        <li><strong>Catalog &amp; proposals</strong> — Gift Catalog, item customization, gift sets, custom items, supplier import, promo codes, proposal emails.</li>
        <li><strong>Workflows</strong> — Quick Send bulk email and the multi-step Workflow Manager with dry-run.</li>
        <li><strong>Configuration</strong> — feature toggles, themes, keyboard shortcuts, per-surface UI scale, shared settings templates, Power Automate.</li>
      </ul>

      <div className="docnote info" style={{ marginTop: 28 }}>
        <span className="dn-ico"><I.user size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">A note on terms you'll see</div>
          <p style={{ margin: 0 }}>
            <strong>Power Automate</strong> is the optional flow that sends email silently — with it off (the
            default), Send opens a pre-filled <strong>Outlook</strong> window instead. <strong>Signifyd</strong> is the
            fraud-scoring service behind the colored glow on risky orders. <strong>admin.icustomize.com</strong> is
            the back-office order system the extension also enhances — order notes and date pushes go
            through it. And a <strong>proposal</strong> is a tracked, priced quote built from the Gift Catalog
            that the customer can open as a live cart.
          </p>
        </div>
      </div>
    </div>
  );
}
