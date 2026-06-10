/* page-getting-started.jsx — intro + how-to-read + reasoning note */
(function () {
  const { I } = window.GB;
  window.GBPages = window.GBPages || {};

  function FeatureCard({ icon, title, desc, go }) {
    return (
      <button className="featurecard" onClick={() => (window.location.hash = go)}>
        <span className="fc-ico">{icon}</span>
        <span className="fc-t">{title}</span>
        <span className="fc-d">{desc}</span>
      </button>
    );
  }

  function StartPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Golfballs.com Browser Extension · v3.3</div>
        <h1 className="title">Everything the extension does, shown live.</h1>
        <p className="lede">
          This is the operator's manual for the Golfballs.com Chrome extension — the toolkit that
          layers email templates, charging, CRM lookups, tasks, proofs, a product catalog and more
          on top of the admin site. Every screen below is the <strong>real interface, running live</strong> on
          sample data. You can watch a guided walkthrough, hover numbered hotspots to learn each
          control, or just click around yourself.
        </p>

        <div className="docnote brand">
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">How this guide is built — and what's assumed</div>
            <p>
              Rather than screenshots that rot the moment the UI changes, this guide mounts the
              extension's actual React components in a sandbox with a mocked browser + fake order
              data. So what you see and click is the genuine article, driven by the same code that
              ships. Walkthroughs are scripted to move a cursor and operate the controls for you.
            </p>
            <p>
              <strong>Assumptions I made</strong> (tell me if any are wrong): the audience is a brand-new
              rep who has never opened the extension; we lead with the daily-driver popup, then
              Settings, then the deeper tools; sample customers/orders are invented; and anything
              that opens a modal <em>on the host page</em> (Charge, Order Edit) is narrated with a toast
              here, because that surface lives on golfballs.com, not inside the popup. A separate,
              developer-only <a href="#audit">Wiring Audit</a> tracks settings that exist but aren't fully hooked up.
            </p>
          </div>
        </div>

        <h2 className="sec">Three ways to learn each screen</h2>
        <div className="cardgrid">
          <div className="featurecard" style={{ cursor: 'default' }}>
            <span className="fc-ico">{I.grid({ size: 17 })}</span>
            <span className="fc-t">Tour</span>
            <span className="fc-d">Numbered hotspots pin every control. Hover a pin or a legend row to highlight what it points at. Best for "what is this button?"</span>
          </div>
          <div className="featurecard" style={{ cursor: 'default' }}>
            <span className="fc-ico">{I.play({ size: 17 })}</span>
            <span className="fc-t">Play walkthrough</span>
            <span className="fc-d">Press play and the screen operates itself — cursor moves, menus open, fields fill — with a caption for each step. Pause or reset anytime.</span>
          </div>
          <div className="featurecard" style={{ cursor: 'default' }}>
            <span className="fc-ico">{I.cube({ size: 17 })}</span>
            <span className="fc-t">Try it</span>
            <span className="fc-d">Hands on the wheel. The live UI is yours to click — wired to sample data, so nothing here can touch a real order. Reset to start fresh.</span>
          </div>
        </div>

        <h2 className="sec">Start here</h2>
        <p>New to the extension? Read these in order. Each is a full page with the live UI and a walkthrough.</p>
        <div className="cardgrid">
          <FeatureCard icon={I.mail({ size: 17 })} title="The Popup" desc="Your home base — opens from the toolbar icon. Templates, charging, watch list, tasks, CRM, proofs." go="#popup" />
          <FeatureCard icon={I.cog({ size: 17 })} title="Settings & Manager" desc="Turn features on/off, set theme, shortcuts, UI scale, presets — every toggle explained." go="#settings" />
          <FeatureCard icon={I.edit({ size: 17 })} title="Email Templates" desc="Build templates with variables that auto-fill from the order, plus A/B variations." go="#templates" />
          <FeatureCard icon={I.search({ size: 17 })} title="CRM Tools" desc="Search customers, create contacts, and build advanced queries without leaving the page." go="#crm" />
        </div>

        <h2 className="sec">The full toolkit</h2>
        <p>Everything the extension adds, grouped the way it's grouped in the product.</p>
        <ul>
          <li><strong>Daily driver</strong> — the Popup, Email Templates, Charge / Refund, Order Edit, Submit Proof.</li>
          <li><strong>Stay organized</strong> — Watch List, My Tasks, Quick Task, Call Log, Calendar.</li>
          <li><strong>Find people fast</strong> — CRM Search, Create Contact, CRM Query Builder, Phone Finder.</li>
          <li><strong>On-page helpers</strong> — Email Preview, Image / Logo Viewer, Text Preview, Margin Calculator, Copy IDs, Signifyd Glow.</li>
          <li><strong>Product &amp; art</strong> — Gift Catalog, the 3D Golfball Viewer, Grass Mockup Composer.</li>
          <li><strong>Configuration</strong> — Settings, Themes, Keyboard Shortcuts, UI Scale, Power Automate, Developer Settings.</li>
        </ul>

        <div className="docnote info" style={{ marginTop: 28 }}>
          <span className="dn-ico">{I.user({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">A note on terms you'll see</div>
            <p style={{ margin: 0 }}>
              <strong>Outlook</strong> is where finished emails open. <strong>Power Automate</strong> is an optional
              Microsoft flow that can send email directly (covered in Settings). <strong>Signifyd</strong> is the
              fraud-scoring service whose status drives the "glow" on risky orders. <strong>iCustomize / admin.icustomize.com</strong> is
              the back-office order system the extension also enhances.
            </p>
          </div>
        </div>
      </div>
    );
  }

  window.GBPages['start'] = { title: 'Getting Started', group: 'Overview', icon: 'bolt', render: () => <StartPage /> };
})();
