/* page-settings.jsx — DEEP page: Manager → Settings.
   Restructured into focused TourBoxes — each setting group's live
   controls sit beside their explanation. */
(function () {
  const { useState } = React;
  const { I, Switch } = window.GB;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  const Bits = window.GBSettingsBits || {};
  window.GBPages = window.GBPages || {};

  function VariantSnippet() {
    const [v, setV] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
    return (
      <MiniFrame width={420} label="settings · variant" pad>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(Bits.VARIANTS || []).map((vv) => <Bits.VariantCard key={vv.id} v={vv} active={v === vv.id} onClick={() => setV(vv.id)} />)}
        </div>
      </MiniFrame>
    );
  }

  function FeaturesSnippet() {
    const subset = ['emailTemplatesEnabled', 'chargeEnabled', 'marginCalcEnabled', 'watchListEnabled'];
    const data = (Bits.FEATURE_FLAGS || []).filter((f) => subset.includes(f.key));
    const [on, setOn] = useState({ emailTemplatesEnabled: true, chargeEnabled: true, marginCalcEnabled: false, watchListEnabled: true });
    const FS = window.GB.FeatureSpotlight;
    return (
      <MiniFrame width={400} label="settings · features" pad>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((f) => <FS key={f.key} on={on[f.key]} icon={Bits.ICON_EL(f.icon)} name={f.name} desc={f.desc} size="sm" onChange={() => setOn((p) => ({ ...p, [f.key]: !p[f.key] }))} />)}
        </div>
      </MiniFrame>
    );
  }

  function ShortcutsSnippet() {
    const [vals, setVals] = useState({ taskList: 'X', marginCalc: 'M' });
    const rows = (Bits.SHORTCUTS || []).slice(0, 2);
    return (
      <MiniFrame width={400} label="settings · shortcuts" pad>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((s) => <Bits.ShortcutRow key={s.key} s={s} value={vals[s.key]} onChange={(v) => setVals((p) => ({ ...p, [s.key]: v }))} />)}
        </div>
      </MiniFrame>
    );
  }

  function PASnippet() {
    const [on, setOn] = useState(false);
    const [url, setUrl] = useState('');
    return (
      <MiniFrame width={420} label="settings · experimental" pad>
        <Bits.ExpandablePA on={on} onChange={setOn} url={url} onUrl={setUrl} />
      </MiniFrame>
    );
  }

  function DevSnippet() {
    const rows = (Bits.DEV_ROWS || []).slice(0, 3);
    const [vals, setVals] = useState(() => Object.fromEntries(rows.map((d) => [d.key, d.default])));
    return (
      <MiniFrame width={420} label="settings · developer" pad>
        <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: '4px 12px' }}>
          {rows.map((d) => <Bits.DevRow key={d.key} def={d} value={vals[d.key]} onChange={(v) => setVals((p) => ({ ...p, [d.key]: v }))} />)}
        </div>
      </MiniFrame>
    );
  }

  function SettingsPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Configuration</div>
        <h1 className="title">Settings &amp; Manager</h1>
        <p className="lede">
          Click <strong>Manage</strong> in the popup to open the full Manager. Its Settings page is mission control —
          turn features on or off, restyle the extension, bind shortcuts, and tune behavior. Every change saves
          instantly. Each group is shown live below, next to what it does.
        </p>

        {TourBox && (<>
          <TourBox n={1} eyebrow="Appearance" title="Theme variant" live={<VariantSnippet />} flip>
            <p>Pick a base look — <strong>Dark</strong>, <strong>Light</strong>, <strong>Midnight</strong> (deeper blacks, punchier green), or <strong>Cream</strong> (warm beige). It restyles the whole extension: popup, every modal, and on-page widgets.</p>
            <p>Below the variants (in the real panel) sit <strong>Theme Colors</strong> for overriding the brand color, and <strong>UI Scale</strong> to zoom each surface independently. Click a card — it's live.</p>
          </TourBox>

          <TourBox n={2} eyebrow="The master switches" title="Feature toggles" live={<FeaturesSnippet />} wide>
            <p>The Features list has <strong>16 switches</strong>. Each shows or hides one tool across the popup and the order page. Off means it simply disappears — nothing breaks.</p>
            <p>This is the direct counterpart to <a href="#popup">the popup</a>: turn <strong>Charge Card</strong> off here and the Charge button vanishes there. The full list is in the table below.</p>
          </TourBox>

          <TourBox n={3} eyebrow="Speed" title="Keyboard shortcuts" live={<ShortcutsSnippet />} flip>
            <p>Four global shortcuts, each fired with <span className="kbd">Ctrl</span> + the bound letter, work from any page: <strong>My Tasks</strong> (X), <strong>Margin Calculator</strong> (M), <strong>CRM Search</strong> (K), <strong>New Contact</strong> (Q).</p>
            <p>Clear a box to disable that shortcut; type a letter to rebind it. (Try it — these fields are live.)</p>
          </TourBox>

          <TourBox n={4} eyebrow="Experimental" title="Power Automate — direct send" live={<PASnippet />} wide>
            <p>By default Send opens Outlook. Flip this on and paste a flow URL, and opted-in templates send straight through a Microsoft Power Automate flow — no Outlook window.</p>
            <p>Setup is three steps inside Power Automate (HTTP-trigger flow → Send-email action → paste the URL). <strong>Test connection</strong> validates the URL first. Leave it off unless your team set this up.</p>
          </TourBox>

          <TourBox n={5} eyebrow="Power-user" title="Developer settings" live={<DevSnippet />} flip>
            <p>A searchable table of low-level knobs — animation timing, draggable vs. centered modals, the 3D viewer's defaults, the sender email's local-part. Most reps never open this.</p>
            <p>They exist so behavior can be tuned without a code change. Booleans toggle, numbers and strings take typed values.</p>
          </TourBox>
        </>)}

        <h2 className="sec">Every feature toggle</h2>
        <p>The complete Features list and exactly what each switch governs.</p>
        <FlagTable />

        <h2 className="sec">Also in Settings</h2>
        <ul>
          <li><strong>Shared Settings Templates</strong> — name a scoped snapshot, copy its revocable URL, and let a teammate preview and choose what to import. Template imports <em>merge by id</em>, preserving local-only templates.</li>
          <li><strong>Custom Pages</strong> — enable the custom interface per registered page scope. Disabled scopes use the original site.</li>
          <li><strong>Theme Colors &amp; UI Scale</strong> — override the brand/accent colors and zoom each extension surface independently of the host site.</li>
        </ul>
      </div>
    );
  }

  function FlagTable() {
    const flags = window.GB_FEATURE_FLAGS_DATA || [];
    return (
      <table className="spectable">
        <thead><tr><th>Toggle</th><th>What it controls</th></tr></thead>
        <tbody>{flags.map((f) => <tr key={f.key}><td style={{ whiteSpace: 'nowrap' }}><b>{f.name}</b></td><td>{f.desc}</td></tr>)}</tbody>
      </table>
    );
  }

  window.GBPages['settings'] = { title: 'Settings & Manager', group: 'Configuration', icon: 'cog', render: () => <SettingsPage /> };
})();
