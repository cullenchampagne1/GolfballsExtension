/* eslint-disable react/prop-types */
/* Design System showcase page */

const {
  Icon, I,
  Btn, IconBtn,
  Tag, Chip, Dot,
  Input, Textarea, Dropdown, Field,
  Switch, PillTag,
  ModalShell, ModalHeader, ModalFooter,
  SectionLabel, Card, KeyVal,
  Callout, Checkbox, Slider, RangeSlider, SwitchTag,
} = window;

const { useState } = React;

/* ═══════════════════════════════════════════════════════════════
   EXPANDABLE FEATURE — Power Automate + Developer Mode
═══════════════════════════════════════════════════════════════ */
function ExpandableFeatureSection() {
  const { ExpandableFeature } = window;
  const [paOn, setPaOn]   = useState(true);
  const [paUrl, setPaUrl] = useState('https://prod-22.eastus.logic.azure.com/workflows/8a7c…');
  const [devOn, setDevOn] = useState(true);

  // Dev test console buttons
  const fakeFire = (msg) => console.log('would fire:', msg);

  const NotifBtn = ({ tone, label }) => (
    <button onClick={() => fakeFire(label)} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 11px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      transition: 'all var(--gb-anim)',
    }}>
      <Dot tone={tone} glow size={6} />
      {label}
    </button>
  );

  const ModalBtn = ({ icon, label, meta, metaTone }) => (
    <button onClick={() => fakeFire(label)} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      transition: 'all var(--gb-anim)',
    }}>
      <span style={{ color: 'var(--gb-text-tertiary)', display: 'flex' }}>{React.cloneElement(icon, { size: 12 })}</span>
      {label}
      {meta && (
        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 500,
          color: metaTone === 'error' ? 'var(--gb-error-fg)' :
                 metaTone === 'brand' ? 'var(--gb-brand-label)' :
                 'var(--gb-text-ghost)' }}>
          {meta}
        </span>
      )}
    </button>
  );

  return (
    <div>
      <H2 num="06f" sub="Two dropdown-style feature controls from the settings panel: Direct Send via Power Automate (with flow URL config) and Developer Mode (with test console). Built on a shared ExpandableFeature primitive — toggle in header, sub-settings reveal below.">
        Expandable feature controls
      </H2>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* A — Power Automate */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="warning" size="sm">A · POWER AUTOMATE</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Toggle + Flow URL config + setup helper</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Warning-toned because misconfiguring this routes real emails through an unverified flow. The amber treatment + ACTIVE pill make the state unmistakable.
            </div>
          </div>
          <ExpandableFeature
            tone="warning"
            on={paOn}
            onChange={setPaOn}
            icon={<I.send />}
            name="Direct Send via Power Automate"
            desc="When enabled and a flow URL is set, the send button becomes Send and emails go directly through Power Automate — no Outlook window."
          >
            <Field label="Flow URL" required>
              <Input
                value={paUrl}
                mono
                placeholder="https://prod-XX.eastus.logic.azure.com/workflows/…"
                leading={<I.bolt />}
              />
            </Field>

            <div style={{
              marginTop: 12, padding: 11,
              background: 'var(--gb-warning-tint-soft)',
              border: '1px solid var(--gb-warning-tint-border)',
              borderLeft: '3px solid var(--gb-warning)',
              borderRadius: 'var(--gb-r-sm)',
              fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.55,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-warning-fg)', marginBottom: 4 }}>
                Set up in Power Automate
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Create <b style={{ color: 'var(--gb-text-secondary)' }}>New flow</b> → <b style={{ color: 'var(--gb-text-secondary)' }}>When an HTTP request is received</b></li>
                <li>Add a <b style={{ color: 'var(--gb-text-secondary)' }}>Send an email (V2)</b> action</li>
                <li>Save and paste the generated URL above</li>
              </ol>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Btn variant="tinted" status="warning" size="sm" icon={<I.bolt />}>Test connection</Btn>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
                <Dot tone="brand" glow size={5} /> Connected · last test 2m ago
              </span>
            </div>
          </ExpandableFeature>
        </div>

        {/* B — Developer Mode */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">B · DEVELOPER MODE</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Toggle + test console with categorized actions</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Brand-toned because this is a sanctioned tool, not a risky setting. The console groups actions by category (Notifications, Modals) with quick-fire buttons.
            </div>
          </div>
          <ExpandableFeature
            tone="brand"
            on={devOn}
            onChange={setDevOn}
            icon={<I.bolt />}
            name="Developer Mode"
            desc="Reveals a test console for firing notifications and opening modals on the active tab. API calls fail gracefully — UI is fully visible."
          >
            {/* Notifications row */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
                Notifications
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <NotifBtn tone="brand"   label="Info" />
                <NotifBtn tone="success" label="Success" />
                <NotifBtn tone="error"   label="Error" />
                <NotifBtn tone="warning" label="Loading" />
              </div>
            </div>

            {/* Modals list */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
                Modals
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <ModalBtn icon={<I.card />}   label="Charge Card"            meta="+$12.50 due" metaTone="brand" />
                <ModalBtn icon={<I.card />}   label="Charge — Refund state"  meta="−$12.50"     metaTone="error" />
                <ModalBtn icon={<I.edit />}   label="Calendar / Date Picker" meta="dev mode" />
                <ModalBtn icon={<I.eye />}    label="Image / Logo Viewer"    meta="placeholder" />
                <ModalBtn icon={<I.send />}   label="Submit Proof Modal"     meta="stub data" />
                <ModalBtn icon={<I.mail />}   label="Email Preview — Case"   meta="w/ sidebar" />
                <ModalBtn icon={<I.mail />}   label="Email Preview — No case" meta="no sidebar" />
                <ModalBtn icon={<I.eye />}    label="Watch List Modal" />
              </div>
            </div>

            <div style={{
              padding: '8px 11px',
              background: 'var(--gb-fill-subtle)',
              border: '1px solid var(--gb-border-subtle)',
              borderRadius: 'var(--gb-r-sm)',
              fontSize: 10.5, color: 'var(--gb-text-muted)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <I.alert size={11} style={{ color: 'var(--gb-brand-label)' }} />
              API calls inside modals will fail gracefully — UI is fully visible.
            </div>
          </ExpandableFeature>
        </div>

        <Callout tone="info" title="Pattern notes">
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.65 }}>
            <li>Header is the click target — clicking anywhere on the row toggles the feature. The switch is visual confirmation, not the only affordance.</li>
            <li>Body slides in from the top with the bounce easing when the toggle activates — same motion vocabulary as toasts and modals.</li>
            <li>Both variants share <Mono>ExpandableFeature</Mono> — only the <Mono>tone</Mono> prop differs (warning vs brand).</li>
            <li>The body content is fully composable — anything you'd put in a settings card goes inside. Field controls, helper callouts, test buttons.</li>
          </ul>
        </Callout>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COLOR SPOTLIGHT — variations
═══════════════════════════════════════════════════════════════ */
function ColorSpotlightSection() {
  const { ColorSpotlight, ColorHero, ColorPreview, ColorBank, ColorStatus } = window;
  const defaults = {
    brand:    '#8fce2e',
    error:    '#e25a5a',
    warning:  '#e0a030',
    success:  '#4ec48c',
    info:     '#6ab0f3',
  };
  const [brandA, setBrandA] = useState('#a3e030');
  const [heroB, setHeroB] = useState(defaults.brand);
  const [prevC, setPrevC] = useState(defaults.error);
  const [palette, setPalette] = useState({ ...defaults });
  const [statE, setStatE] = useState('#bce066');

  return (
    <div>
      <H2 num="06e" sub="Color pickers built like the feature toggles — when a color choice deserves attention, not buried in a settings list. Same 5-variant shape: Spotlight · Hero · Preview · Bank · Status.">
        Color spotlight · attention-grabbing color pickers
      </H2>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* A — Spotlight */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">A · SPOTLIGHT</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Full-height swatch · hex · reset</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              The 88px swatch is the click target. "EDITED" pill appears in the corner when modified. Halo glow shows the row is active.
            </div>
          </div>
          <ColorSpotlight value={brandA} defaultValue={defaults.brand} onChange={setBrandA} name="Brand label" desc="The primary green — match dots, focus rings, brand tints all derive from this." varName="--gb-brand-label" />
        </div>

        {/* B — Hero */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">B · HERO</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>The color IS the background</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Most dramatic. Auto-flips text color for readability. Best for the single hero color of a theme — the one decision that defines everything else.
            </div>
          </div>
          <ColorHero value={heroB} defaultValue={defaults.brand} onChange={setHeroB} name="Theme accent" desc="The flagship color. Changes everything tinted in the system." varName="--gb-brand-label" />
        </div>

        {/* C — Preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">C · PREVIEW</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Live preview of where the color shows up</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Bottom panel renders example UI using the picked color. Edit it and watch the components change in real time. For colors with downstream visual impact.
            </div>
          </div>
          <ColorPreview
            value={prevC}
            defaultValue={defaults.error}
            onChange={setPrevC}
            name="Error / destructive"
            desc="Used for error toasts, validation, delete buttons, fraud alerts."
            varName="--gb-error"
            preview={(v) => (
              <Row gap={8}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 7px', borderRadius: 5,
                  background: v + '26', color: v,
                  border: `1px solid ${v}55`,
                  fontSize: 10, fontWeight: 700, letterSpacing: .3, textTransform: 'uppercase',
                }}>CRITICAL</span>
                <button style={{
                  padding: '5px 11px', borderRadius: 6,
                  background: v + '1f', color: v,
                  border: `1px solid ${v}55`,
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}><I.trash size={11} /> Delete</button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v, boxShadow: `0 0 6px ${v}` }} />
                  Charge failed
                </div>
              </Row>
            )}
          />
        </div>

        {/* D — Bank */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">D · BANK</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Grouped palette · stacked swatch preview · reset all</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              For coherent palettes — status colors, brand family, a section of related tokens. Header shows the palette at a glance with overlapping swatches.
            </div>
          </div>
          <ColorBank title="Status palette" palette={palette} defaults={defaults} onChange={setPalette} />
        </div>

        {/* E — Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div>
            <Tag tone="brand" size="sm">E · STATUS</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Custom/Default state + contrast readout</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Shows whether the color differs from the default, plus a live WCAG contrast ratio against the surface. Picks for accessibility-sensitive colors (text, button fg).
            </div>
          </div>
          <ColorStatus
            value={statE}
            defaultValue={defaults.brand}
            onChange={setStatE}
            name="Brand text"
            desc="Used as the foreground on tinted brand backgrounds."
            varName="--gb-brand-label"
            contrast={{ ratio: 4.92, label: 'AA pass' }}
          />
        </div>

        <Callout tone="info" title="Picking a variant">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Spotlight</b> — single attention-worthy color in a list</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Hero</b> — the theme's flagship color</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Preview</b> — colors with visible downstream impact</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Bank</b> — related palette (statuses, brand family)</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Status</b> — accessibility-sensitive colors</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Compact <Mono>.color-row</Mono></b> — background tokens (existing settings pattern)</div>
          </div>
        </Callout>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE TOGGLE — variations
═══════════════════════════════════════════════════════════════ */
function FeatureToggleSection() {
  const { FeatureSpotlight, FeatureHero, FeaturePreview, FeatureBank, FeatureStatus } = window;
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  const [c, setC] = useState(true);
  const [d, setD] = useState(false);
  const [e, setE] = useState(true);
  const [bank, setBank] = useState([
    { id: 'charge',   name: 'Charge Card',   desc: 'Shows the Charge / Refund button in the popup.', icon: <I.card />, on: true  },
    { id: 'order',    name: 'Order Edit',    desc: 'Inline order edit modal on order pages.',        icon: <I.edit />, on: true  },
    { id: 'proof',    name: 'Submit Proof',  desc: 'Submit Proof button on order/contact pages.',    icon: <I.send />, on: false },
    { id: 'watch',    name: 'Watch List',    desc: 'Order follow-up timers and watch popup.',        icon: <I.eye />,  on: true  },
    { id: 'tasks',    name: 'My Tasks',      desc: 'Personal task list with keyboard shortcut.',     icon: <I.check />, on: true  },
    { id: 'crm',      name: 'CRM Search',    desc: 'Searchable CRM modal across contacts/accounts.', icon: <I.search />, on: false },
  ]);

  const PreviewExtensionRow = ({ visible }) => (
    <div style={{
      padding: '8px 10px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      display: 'flex', alignItems: 'center', gap: 7,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.mail size={9} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-secondary)', flex: 1 }}>Templates picker</span>
      <Dot tone="brand" glow size={4} />
    </div>
  );

  return (
    <div>
      <H2 num="06d" sub="When a feature flag isn't background config but a headline decision — the user is here to flip it, look at it, understand its impact. Five variants from compact to spotlight.">
        Feature toggle · attention-grabbing variants
      </H2>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* A — Spotlight */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag tone="brand" size="sm">A · SPOTLIGHT</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Large icon · soft halo when on</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              The default attention-grabbing variant. Big 44px icon tile, prominent switch, soft 4px halo glow when active. Use for primary feature toggles users explicitly seek out.
            </div>
          </div>
          <Col gap={8}>
            <FeatureSpotlight on={a} onChange={setA} icon={<I.card />} name="Charge Card" desc="Show the Charge / Refund button in the toolbar popup. Captures payments from anywhere on the order page." />
            <FeatureSpotlight on={d} onChange={setD} icon={<I.bolt />} name="Auto-push proofs" desc="Automatically submit proof requests when an order matches predefined rules." experimental />
          </Col>
        </div>

        {/* B — Hero */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag tone="brand" size="sm">B · HERO</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Gradient background · radial glow · ACTIVE / OFF tag</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Most dramatic. The card itself changes mood when toggled. For "headline" features at the top of a settings panel — Dev Mode, the main extension on/off, anything that defines the experience.
            </div>
          </div>
          <FeatureHero on={b} onChange={setB} icon={<I.bolt />} name="Dev Mode" desc="Pipes test data into every modal so you can preview the extension without touching real orders. Disables all live API calls." />
        </div>

        {/* C — Preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag tone="brand" size="sm">C · PREVIEW</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Toggle controls a live mini-preview</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Bottom half shows exactly what the toggle controls — desaturated when off, full color when on. Removes ambiguity about "what does this do?" Use for visual features (button visibility, popup elements).
            </div>
          </div>
          <FeaturePreview
            on={c}
            onChange={setC}
            icon={<I.mail />}
            name="Templates in popup"
            desc="Show the templates picker in the toolbar popup."
            preview={(
              <Col gap={6}>
                <PreviewExtensionRow />
                <Row gap={6}>
                  <div style={{ flex: 1, height: 26, borderRadius: 5, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }} />
                  <div style={{ flex: 1, height: 26, borderRadius: 5, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }} />
                </Row>
              </Col>
            )}
          />
        </div>

        {/* D — Bank */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag tone="brand" size="sm">D · BANK</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Grouped toggles · master switch + mixed state</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              Master toggle at top, children below. Indicator shows "X/Y enabled" and warns when mixed. Replaces the existing "Popup Buttons" / "Page Enhancements" sections in your manage panel.
            </div>
          </div>
          <FeatureBank
            title="Popup buttons"
            items={bank}
            onChange={setBank}
          />
        </div>

        {/* E — Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag tone="brand" size="sm">E · STATUS</Tag>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 6 }}>Toggle + live activity stats</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              When the feature has measurable state — open watches, queued tasks, pending matches — show it. Live/Idle dot tells the user the feature is actually doing work right now.
            </div>
          </div>
          <FeatureStatus
            on={e}
            onChange={setE}
            icon={<I.eye />}
            name="Watch List"
            desc="Order follow-up timers with live alerts."
            stats={[
              { label: 'Active', value: '14' },
              { label: 'Alerts', value: '2' },
            ]}
          />
        </div>

        {/* When to use which */}
        <Callout tone="info" title="Picking a variant">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Spotlight</b> — primary controls users seek out</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Hero</b> — headline features that define the experience</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Preview</b> — visual features (button visibility)</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Bank</b> — grouped flags with a master</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Status</b> — features with live measurable activity</div>
            <div><b style={{ color: 'var(--gb-text-secondary)' }}>Compact <Mono>.feat-row</Mono></b> — background config (existing pattern, keep)</div>
          </div>
        </Callout>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION IDEAS — alternative directions
═══════════════════════════════════════════════════════════════ */
function NotificationIdeasSection() {
  const { PillToast, ActionToast, StepToast, TrayToast, EdgeToast, BannerToast } = window;

  // Each idea has its own state (side picker, fire-key for replays, etc)
  const [pillSide,   setPillSide]   = useState('center');
  const [pillKey,    setPillKey]    = useState(0);
  const [actionSide, setActionSide] = useState('right');
  const [actionKey,  setActionKey]  = useState(0);
  const [bannerSide, setBannerSide] = useState('center');
  const [bannerTone, setBannerTone] = useState('info');
  const [bannerKey,  setBannerKey]  = useState(0);
  const [stepIdx,    setStepIdx]    = useState(2);
  const [stepKey,    setStepKey]    = useState(0);
  const [traySide,   setTraySide]   = useState('right');
  const [trayKey,    setTrayKey]    = useState(0);
  const [edgeSide,   setEdgeSide]   = useState('center');
  const [edgeKey,    setEdgeKey]    = useState(0);

  const steps = ['Validating proof file', 'Uploading to S3', 'Creating CRM entry', 'Notifying art team'];
  const trayItems = [
    { tone: 'brand',   title: 'New match',       message: 'Charge Error Follow-Up matched ORD-29481', time: 'now' },
    { tone: 'warning', title: 'Watch flagged',   message: 'Net-30 invoice is 22 days overdue',       time: '2m' },
    { tone: 'success', title: 'Template saved',  message: 'Charge Error Follow-Up synced',           time: '5m' },
    { tone: 'error',   title: 'Charge failed',   message: 'Visa ····4242 declined',                   time: '12m' },
    { tone: 'info',    title: 'Case categorised', message: 'CASE-184221 → Damaged → Replacement',     time: '18m' },
  ];

  // Anchor helper — turns 'left'|'center'|'right' into preview-frame positioning
  const anchorStyle = (side) => ({
    position: 'absolute',
    top: 36,
    left:   side === 'left'   ? 24            : side === 'center' ? '50%'       : undefined,
    right:  side === 'right'  ? 24            : undefined,
    transform: side === 'center' ? 'translateX(-50%)' : undefined,
  });

  // Side picker — small segmented control
  const SidePicker = ({ value, onChange, options = ['left', 'center', 'right'] }) => (
    <div style={{
      display: 'inline-flex', padding: 2, borderRadius: 'var(--gb-r-sm)',
      background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)',
      gap: 1,
    }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '3px 9px', borderRadius: 4,
          fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
          background: value === o ? 'var(--gb-brand-tint-medium)' : 'transparent',
          color:      value === o ? 'var(--gb-brand-label)'       : 'var(--gb-text-muted)',
          border: 'none', cursor: 'pointer',
          textTransform: 'capitalize',
        }}>{o}</button>
      ))}
    </div>
  );

  const ToneSwatchPicker = ({ value, onChange }) => (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      {[
        { id: 'info',    c: 'var(--gb-info)' },
        { id: 'success', c: 'var(--gb-success)' },
        { id: 'brand',   c: 'var(--gb-brand-label)' },
        { id: 'warning', c: 'var(--gb-warning)' },
        { id: 'error',   c: 'var(--gb-error)' },
      ].map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} title={t.id} style={{
          width: 16, height: 16, borderRadius: 4, padding: 0,
          background: t.c,
          border: value === t.id
            ? '2px solid var(--gb-text-primary)'
            : '1px solid var(--gb-border-default)',
          cursor: 'pointer', flexShrink: 0,
        }} />
      ))}
    </div>
  );

  const ideas = [
    {
      n: 'A', name: 'Pill', tagline: 'Radical minimalism',
      desc: 'Single line. Dot · message · close. No icon tile, no label. Fits content width. Use for passive confirmations.',
      use: 'Auto-save · synced · copied',
      sides: ['left', 'center', 'right'],
      side: pillSide, setSide: setPillSide,
      key: pillKey,   fire: () => setPillKey(k => k + 1),
      render: () => <PillToast tone="success" message="Template saved" onDismiss={() => {}} />,
    },
    {
      n: 'B', name: 'Action card', tagline: 'Carries its own CTA',
      desc: 'Card-shaped, not a strip. Primary + secondary actions baked in. Forces the toast to do work — Undo, Retry, View.',
      use: 'Deleted (Undo) · charge ready (Retry) · proof sent (View)',
      sides: ['left', 'right'],
      side: actionSide, setSide: setActionSide,
      key: actionKey,   fire: () => setActionKey(k => k + 1),
      render: () => <ActionToast tone="brand" title="Charge ready to run" message="3 cards on file totaling $1,247.50. Confirm to capture." primary="Run charges" secondary="Cancel" onDismiss={() => {}} />,
    },
    {
      n: 'C', name: 'Step tracker', tagline: 'Multi-step operations',
      desc: 'Shows progress through named steps. Each step has done/active/pending state. Persists until done.',
      use: 'Submit proof · run campaign · sync templates · bulk export',
      sides: null, // always top-center for visibility
      side: 'center',
      key: stepKey, fire: () => { setStepIdx(0); setStepKey(k => k + 1); },
      extraControls: (
        <Row gap={5}>
          <Btn variant="ghost" size="xs" onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}>← Step</Btn>
          <Btn variant="ghost" size="xs" onClick={() => setStepIdx(Math.min(steps.length, stepIdx + 1))}>Step →</Btn>
          <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', alignSelf: 'center', fontFamily: 'var(--gb-font-mono)' }}>
            {stepIdx}/{steps.length}
          </span>
        </Row>
      ),
      render: () => <StepToast steps={steps} currentStep={stepIdx} onDismiss={() => {}} />,
    },
    {
      n: 'D', name: 'Notification tray', tagline: 'Collapsed badge → expands on click',
      desc: 'Stacks fade-in events into a single anchored badge with a counter. Click to expand the feed.',
      use: 'Watch List updates · background CRM sync · email auto-detection',
      sides: ['left', 'right'],
      side: traySide, setSide: setTraySide,
      key: trayKey,   fire: () => setTrayKey(k => k + 1),
      render: () => <TrayToast items={trayItems} onDismiss={() => {}} />,
    },
    {
      n: 'E', name: 'Edge strip', tagline: 'Ambient, hangs from screen edge',
      desc: 'Hangs down from the top edge of the viewport. Short, single-line, hidden until needed. Stays out of the way.',
      use: 'Background status · "dev mode active" · connection lost',
      sides: ['left', 'center', 'right'],
      side: edgeSide, setSide: setEdgeSide,
      key: edgeKey,   fire: () => setEdgeKey(k => k + 1),
      // edge attaches to the top edge of the preview frame
      anchorOverride: (side) => ({
        position: 'absolute',
        top: 0,
        left:   side === 'left'   ? 24            : side === 'center' ? '50%'       : undefined,
        right:  side === 'right'  ? 24            : undefined,
        transform: side === 'center' ? 'translateX(-50%)' : undefined,
      }),
      render: () => <EdgeToast tone="brand" message="Watching 142 orders · last sync 12s ago" onDismiss={() => {}} />,
    },
    {
      n: 'F', name: 'Floating banner', tagline: 'Informative · mid-width · still floats',
      desc: 'Sits between Pill (too small) and Edge (too wide). 480px max. Floats with a shadow, has icon + title + message + close. The default for substantive informative notifications.',
      use: 'Match found · feature toggled · template synced · campaign started',
      sides: ['left', 'center', 'right'],
      side: bannerSide, setSide: setBannerSide,
      key: bannerKey, fire: () => setBannerKey(k => k + 1),
      extraControls: <ToneSwatchPicker value={bannerTone} onChange={setBannerTone} />,
      render: () => <BannerToast tone={bannerTone} side={bannerSide} title="Match found" message="3 templates match this order. Click to pick." onDismiss={() => {}} />,
    },
  ];

  return (
    <div>
      <H2 num="06b" sub="Six structurally different directions. Each preview has its own Fire button (re-plays the entrance animation) and a side picker where it makes sense.">
        Notification ideas
      </H2>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ideas.map(idea => (
          <div key={idea.n} style={{
            display: 'grid', gridTemplateColumns: '320px 1fr',
            background: 'var(--gb-surface-1)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-xl)',
            overflow: 'hidden',
          }}>
            {/* Left: explanation + controls */}
            <div style={{ padding: 18, borderRight: '1px solid var(--gb-border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-text-ghost)', fontWeight: 700 }}>{idea.n}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.2 }}>{idea.name}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-brand-label)', marginTop: 2, textTransform: 'uppercase', letterSpacing: .6 }}>
                  {idea.tagline}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.55 }}>
                {idea.desc}
              </div>

              <div style={{
                padding: '8px 10px',
                background: 'var(--gb-fill-subtle)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
                fontSize: 10.5, color: 'var(--gb-text-muted)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--gb-text-tertiary)', textTransform: 'uppercase', letterSpacing: .6, fontSize: 9.5 }}>
                  When to use ·
                </span>{' '}
                {idea.use}
              </div>

              {/* Controls */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {idea.sides && (
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginBottom: 5 }}>Side</div>
                    <SidePicker value={idea.side} onChange={idea.setSide} options={idea.sides} />
                  </div>
                )}
                {idea.extraControls && (
                  <div>{idea.extraControls}</div>
                )}
                <Btn variant="primary" size="sm" icon={<I.bolt />} full onClick={idea.fire}>
                  Fire notification
                </Btn>
              </div>
            </div>

            {/* Right: preview frame */}
            <div style={{
              position: 'relative', minHeight: 280,
              background: `
                linear-gradient(180deg, var(--gb-surface-canvas), var(--gb-surface-canvas)),
                repeating-linear-gradient(45deg, var(--gb-fill-faint) 0, var(--gb-fill-faint) 1px, transparent 1px, transparent 18px)
              `,
              padding: 30,
              overflow: 'hidden',
            }}>
              {/* Faux page background */}
              <div style={{
                position: 'absolute', inset: 18,
                border: '1px dashed var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: 8, left: 14,
                fontSize: 9, fontFamily: 'var(--gb-font-mono)',
                color: 'var(--gb-text-ghost)', letterSpacing: .3,
              }}>preview · click Fire to re-play animation</div>

              {/* The actual notification, anchored */}
              <div
                key={idea.key}
                style={idea.anchorOverride ? idea.anchorOverride(idea.side) : anchorStyle(idea.side)}
              >
                {idea.render()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 14, padding: 14,
        background: 'var(--gb-info-tint-soft)',
        border: '1px solid var(--gb-info-tint-border)',
        borderLeft: '3px solid var(--gb-info-fg)',
        borderRadius: 'var(--gb-r-sm)',
        fontSize: 11.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.55,
      }}>
        These six aren't mutually exclusive — a mature extension uses several. Pill for{' '}
        <i>"copied to clipboard"</i>. Banner for <i>"3 templates matched"</i>. Action card for{' '}
        <i>"Charge ready · run"</i>. Step tracker for <i>"Submitting proof…"</i>. Tray for the background event stream.{' '}
        Edge strip for <i>"dev mode active"</i>.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   THEMING SECTION
═══════════════════════════════════════════════════════════════ */
function ThemingSection({ theme, setTheme }) {
  // The 19 base tokens, grouped
  const baseGroups = [
    {
      group: 'Fill mode', count: 2,
      tokens: [
        { name: '--gb-mode-fill-base',    desc: 'Which way fills tint (e.g. "255,255,255")' },
        { name: '--gb-mode-fill-inverse', desc: 'Inverse direction for input recess' },
      ],
    },
    {
      group: 'Surface', count: 6,
      tokens: [
        { name: '--gb-surface-deep',    desc: 'Header/footer strips, page edges' },
        { name: '--gb-surface-canvas',  desc: 'Page background' },
        { name: '--gb-surface-1',       desc: 'Card / input background' },
        { name: '--gb-surface-2',       desc: 'Hover / selected card' },
        { name: '--gb-surface-3',       desc: 'Floating menu' },
        { name: '--gb-surface-modal',   desc: 'Dropdowns and modal body' },
      ],
    },
    {
      group: 'Text', count: 5,
      tokens: [
        { name: '--gb-text-primary',    desc: 'Headings' },
        { name: '--gb-text-secondary',  desc: 'Body' },
        { name: '--gb-text-tertiary',   desc: 'Labels' },
        { name: '--gb-text-muted',      desc: 'Hints' },
        { name: '--gb-text-ghost',      desc: 'Placeholders' },
      ],
    },
    {
      group: 'Border', count: 3,
      tokens: [
        { name: '--gb-border-subtle',   desc: 'Lightest divider' },
        { name: '--gb-border-default',  desc: 'Card outline' },
        { name: '--gb-border-strong',   desc: 'Emphasized outline' },
      ],
    },
    {
      group: 'Brand', count: 1,
      tokens: [
        { name: '--gb-brand-label',     desc: 'The one driving color. Every brand-tint-* derives from this.' },
      ],
    },
    {
      group: 'Status', count: 4,
      tokens: [
        { name: '--gb-error',           desc: 'Error solid' },
        { name: '--gb-warning',         desc: 'Warning solid' },
        { name: '--gb-success',         desc: 'Success solid' },
        { name: '--gb-info',            desc: 'Info solid' },
      ],
    },
  ];

  // Tokens that auto-derive — listed for comparison
  const derivedGroups = [
    { name: 'All --gb-fill-*',         from: '--gb-mode-fill-base · rgba()',                count: 5 },
    { name: 'All --gb-fill-inverse-*', from: '--gb-mode-fill-inverse · rgba()',             count: 3 },
    { name: 'All --gb-brand-tint-*',   from: '--gb-brand-label · color-mix()',              count: 4 },
    { name: 'All --gb-error-tint-*',   from: '--gb-error · color-mix()',                    count: 4 },
    { name: 'All --gb-warning-tint-*', from: '--gb-warning · color-mix()',                  count: 4 },
    { name: 'All --gb-success-tint-*', from: '--gb-success · color-mix()',                  count: 4 },
    { name: 'All --gb-info-tint-*',    from: '--gb-info · color-mix()',                     count: 4 },
    { name: '--gb-border-focus',       from: '--gb-brand-label',                            count: 1 },
    { name: '--gb-text-on-tint',       from: '--gb-brand-label',                            count: 1 },
    { name: 'All shadows',             from: 'Static rgba (same both themes)',              count: 2 },
    { name: '--gb-focus-ring',         from: '--gb-brand-tint-medium',                      count: 1 },
    { name: 'Radii, motion, type',     from: 'Global constants',                            count: 12 },
  ];

  // Mini preview component — renders a tiny modal in any theme
  const Preview = ({ themeName }) => (
    <div data-theme={themeName} style={{
      borderRadius: 'var(--gb-r-md)',
      overflow: 'hidden',
      border: '1px solid var(--gb-border-default)',
      background: 'var(--gb-surface-canvas)',
    }}>
      <div style={{
        padding: '8px 10px',
        background: 'var(--gb-fill-inverse-strong)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 4,
          background: 'var(--gb-brand-tint-medium)',
          border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.card size={10} /></div>
        <div style={{ flex: 1, fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Modal</div>
        <div style={{
          width: 16, height: 16, borderRadius: 3,
          background: 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-default)',
          color: 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.close size={8} /></div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Dot tone="brand" glow size={5} />
          <span style={{ fontSize: 10, color: 'var(--gb-text-secondary)' }}>Matched</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>$1,247</span>
        </div>
        <div style={{
          height: 22, padding: '0 8px',
          background: 'var(--gb-fill-inverse-medium)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 4,
          display: 'flex', alignItems: 'center',
          fontSize: 10, color: 'var(--gb-text-secondary)',
        }}>ORD-29481</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Tag tone="brand"   size="xs">OK</Tag>
          <Tag tone="error"   size="xs">!</Tag>
          <Tag tone="warning" size="xs">···</Tag>
        </div>
      </div>
      <div style={{
        padding: '6px 10px',
        background: 'var(--gb-fill-inverse-strong)',
        borderTop: '1px solid var(--gb-border-subtle)',
        display: 'flex', justifyContent: 'flex-end', gap: 4,
      }}>
        <div style={{
          height: 22, padding: '0 8px', borderRadius: 4,
          background: 'transparent', color: 'var(--gb-text-tertiary)',
          fontSize: 10, fontWeight: 600,
          display: 'flex', alignItems: 'center',
        }}>Cancel</div>
        <div style={{
          height: 22, padding: '0 10px', borderRadius: 4,
          background: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)',
          color: 'var(--gb-text-on-brand)', border: '1px solid var(--gb-brand-border)',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center',
        }}>Confirm</div>
      </div>
    </div>
  );

  return (
    <div>
      <H2 num="01b" sub="A new theme is a list of 19 colors. Everything else — tints, focus rings, hovers, shadows — recomputes from those 19 automatically.">
        Theming
      </H2>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 4-theme preview grid */}
        <Block>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 12 }}>
            Four themes, same components, same code path
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { id: 'dark',     label: 'Dark',     desc: 'Default. Cool grays.' },
              { id: 'midnight', label: 'Midnight', desc: 'Deeper, punchier brand.' },
              { id: 'light',    label: 'Light',    desc: 'White surfaces, darker brand.' },
              { id: 'cream',    label: 'Cream',    desc: 'Warm beige, sepia-adjacent.' },
            ].map(t => (
              <div key={t.id} onClick={() => setTheme(t.id)} style={{
                cursor: 'pointer',
                padding: 10, borderRadius: 'var(--gb-r-md)',
                background: theme === t.id ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)',
                border: '1px solid ' + (theme === t.id ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                transition: 'all var(--gb-anim)',
              }}>
                <Preview themeName={t.id} />
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme === t.id ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>{t.label}</span>
                  {theme === t.id && <Tag tone="brand" size="xs">ACTIVE</Tag>}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>{t.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: 11, background: 'var(--gb-fill-subtle)', borderRadius: 'var(--gb-r-sm)', fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.55 }}>
            Click any preview to apply it to this whole page. Notice how the brand label, surfaces, and text shift —{' '}
            everything else (border opacities, status tints, focus rings, hover fills) recomputes automatically because{' '}
            it derives from the 19 base tokens.
          </div>
        </Block>

        {/* Atomic vs derived */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Block>
            <Tag tone="brand" size="md">ATOMIC · 19 tokens</Tag>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 10 }}>What you define per theme</div>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 4, lineHeight: 1.5, marginBottom: 12 }}>
              Concrete colors. Hand-picked. Pick these, and you have a theme.
            </div>
            {baseGroups.map(g => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{g.group}</span>
                  <Tag tone="neutral" size="xs">{g.count}</Tag>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 4 }}>
                  {g.tokens.map(t => (
                    <div key={t.name} style={{ display: 'flex', gap: 10, fontSize: 10.5, alignItems: 'baseline' }}>
                      <Mono>{t.name}</Mono>
                      <span style={{ color: 'var(--gb-text-muted)' }}>{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Block>

          <Block>
            <Tag tone="neutral" size="md">DERIVED · ~50 tokens</Tag>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 10 }}>What you get for free</div>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 4, lineHeight: 1.5, marginBottom: 12 }}>
              Calculated once, applies to every theme.
              Uses <Mono>color-mix()</Mono> and <Mono>rgba()</Mono> against the atomic tokens.
            </div>
            {derivedGroups.map(g => (
              <div key={g.name} style={{
                padding: '8px 10px', marginBottom: 4,
                background: 'var(--gb-fill-subtle)',
                borderRadius: 'var(--gb-r-sm)',
                display: 'flex', alignItems: 'baseline', gap: 8,
              }}>
                <Tag tone="neutral" size="xs">{g.count}</Tag>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{g.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 2 }}>
                    derives from <Mono>{g.from}</Mono>
                  </div>
                </div>
              </div>
            ))}
          </Block>
        </div>

        {/* Recipe */}
        <Block>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Recipe · add a new theme</span>
            <Tag tone="brand" size="sm">19 LINES</Tag>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
            Paste this block at the bottom of <Mono>system-tokens.css</Mono>, change the 19 values,{' '}
            then set <Mono>document.documentElement.dataset.theme = "your-theme"</Mono>.
          </div>
          <div style={{
            padding: '16px 18px',
            background: 'var(--gb-surface-modal)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            fontFamily: 'var(--gb-font-mono)',
            fontSize: 11,
            color: 'var(--gb-text-secondary)',
            lineHeight: 1.7,
            overflowX: 'auto',
          }}>
{`[data-theme="your-theme"] {
  /* Fill mode — 255,255,255 for dark-ish, 0,0,0 for light-ish */
  --gb-mode-fill-base:    `}<span style={{ color: 'var(--gb-brand-label)' }}>255, 255, 255</span>{`;
  --gb-mode-fill-inverse: `}<span style={{ color: 'var(--gb-brand-label)' }}>0, 0, 0</span>{`;

  /* Surfaces */
  --gb-surface-deep:      `}<span style={{ color: 'var(--gb-info)' }}>#0a0b0c</span>{`;
  --gb-surface-canvas:    `}<span style={{ color: 'var(--gb-info)' }}>#0e0f10</span>{`;
  --gb-surface-1:         `}<span style={{ color: 'var(--gb-info)' }}>#16181a</span>{`;
  --gb-surface-2:         `}<span style={{ color: 'var(--gb-info)' }}>#1c1f22</span>{`;
  --gb-surface-3:         `}<span style={{ color: 'var(--gb-info)' }}>#232629</span>{`;
  --gb-surface-modal:     `}<span style={{ color: 'var(--gb-info)' }}>#131517</span>{`;

  /* Text */
  --gb-text-primary:      `}<span style={{ color: 'var(--gb-info)' }}>#f5f6f7</span>{`;
  --gb-text-secondary:    `}<span style={{ color: 'var(--gb-info)' }}>#d4d6d9</span>{`;
  --gb-text-tertiary:     `}<span style={{ color: 'var(--gb-info)' }}>#9ca0a6</span>{`;
  --gb-text-muted:        `}<span style={{ color: 'var(--gb-info)' }}>#6b6f76</span>{`;
  --gb-text-ghost:        `}<span style={{ color: 'var(--gb-info)' }}>#45494f</span>{`;

  /* Borders */
  --gb-border-subtle:     `}<span style={{ color: 'var(--gb-info)' }}>#1a1c1f</span>{`;
  --gb-border-default:    `}<span style={{ color: 'var(--gb-info)' }}>#26292d</span>{`;
  --gb-border-strong:     `}<span style={{ color: 'var(--gb-info)' }}>#393d42</span>{`;

  /* Brand & status */
  --gb-brand-label:       `}<span style={{ color: 'var(--gb-brand-label)' }}>#8fce2e</span>{`;
  --gb-error:             `}<span style={{ color: 'var(--gb-error)' }}>#e25a5a</span>{`;
  --gb-warning:           `}<span style={{ color: 'var(--gb-warning)' }}>#e0a030</span>{`;
  --gb-success:           `}<span style={{ color: 'var(--gb-success)' }}>#4ec48c</span>{`;
  --gb-info:              `}<span style={{ color: 'var(--gb-info)' }}>#6ab0f3</span>{`;
}`}
          </div>
        </Block>

        {/* Rules of thumb */}
        <Block>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 4 }}>Rules of thumb</div>
          <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 4, lineHeight: 1.55 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <Callout tone="brand" icon={<I.bolt />} title="Want a shade variant of an existing theme?">
                Only swap the <Mono>--gb-surface-*</Mono> values. Keep everything else.{' '}
                That's how <b>Midnight</b> differs from Dark — it just goes deeper.
              </Callout>
              <Callout tone="info" icon={<I.alert />} title="Want a whole new mood?">
                Swap surfaces + text together (they have to read against each other).{' '}
                <b>Cream</b> changes 11 values out of 19 — surfaces, text, borders, and one brand shade for legibility.
              </Callout>
              <Callout tone="warning" icon={<I.alert />} title="Don't override the derived tokens">
                If you find yourself adding <Mono>--gb-brand-tint-medium</Mono> to a theme block, stop.{' '}
                Either your <Mono>--gb-brand-label</Mono> is wrong for the theme, or you need a new component variant.
              </Callout>
              <Callout tone="success" icon={<I.check />} title="Test in seconds">
                Wire your settings panel to call{' '}
                <Mono>document.documentElement.dataset.theme = id</Mono> and persist it in{' '}
                <Mono>chrome.storage.local.themeColors.theme</Mono>. No reload required.
              </Callout>
            </div>
          </div>
        </Block>

      </div>
    </div>
  );
}

/* ─── Small helpers ─── */
function H1({ children, sub }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -.5, color: 'var(--gb-text-primary)' }}>{children}</h1>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--gb-text-muted)', maxWidth: 720, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}
function H2({ children, sub, num }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        {num && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-text-ghost)' }}>{num}</span>}
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: -.3, color: 'var(--gb-text-primary)' }}>{children}</h2>
      </div>
      {sub && <p style={{ margin: '4px 0 0 36px', fontSize: 12, color: 'var(--gb-text-muted)', maxWidth: 720, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}
function Block({ children, padding = 22, style }) {
  return (
    <div style={{
      padding,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-xl)',
      ...style,
    }}>{children}</div>
  );
}
function Mono({ children }) {
  return <code style={{
    fontFamily: 'var(--gb-font-mono)',
    fontSize: 11,
    color: 'var(--gb-brand-label)',
    background: 'var(--gb-brand-tint-soft)',
    border: '1px solid var(--gb-brand-tint-border)',
    padding: '1px 6px', borderRadius: 4,
  }}>{children}</code>;
}
function Row({ children, gap = 8, wrap = true, align = 'center', style }) {
  return <div style={{
    display: 'flex', alignItems: align, gap,
    flexWrap: wrap ? 'wrap' : 'nowrap',
    ...style,
  }}>{children}</div>;
}
function Col({ children, gap = 8, style }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════════
   TOKEN SWATCH GRIDS
═══════════════════════════════════════════════════════════════ */
function Swatch({ name, varName, type = 'bg', size = 'md' }) {
  const sizes = {
    sm: { h: 36, fs: 10 },
    md: { h: 56, fs: 11 },
    lg: { h: 72, fs: 12 },
  };
  const s = sizes[size];
  if (type === 'bg' || type === 'fill') {
    return (
      <div style={{
        height: s.h, borderRadius: 8,
        background: `var(${varName})`,
        border: '1px solid var(--gb-border-default)',
        padding: 10,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: s.fs, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</div>
        <div style={{ fontSize: 9, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{varName}</div>
      </div>
    );
  }
  if (type === 'border') {
    return (
      <div style={{
        height: s.h, borderRadius: 8,
        background: 'var(--gb-surface-1)',
        border: `1px solid var(${varName})`,
        padding: 10,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: s.fs, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</div>
        <div style={{ fontSize: 9, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{varName}</div>
      </div>
    );
  }
  if (type === 'text') {
    return (
      <div style={{
        height: s.h, borderRadius: 8,
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-default)',
        padding: 10,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: s.fs + 2, fontWeight: 700, color: `var(${varName})` }}>{name}</div>
        <div style={{ fontSize: 9, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{varName}</div>
      </div>
    );
  }
  return null;
}

function TokenGrid({ items, columns = 3 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {items.map(it => <Swatch key={it.varName} {...it} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════ */
function DesignSystem() {
  const [theme, setTheme] = useState('dark');
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gb-surface-canvas)',
      color: 'var(--gb-text-secondary)',
      fontFamily: 'var(--gb-font-sans)',
      padding: '40px 28px 120px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* HERO */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'var(--gb-brand-tint-medium)',
              border: '1px solid var(--gb-brand-tint-border)',
              color: 'var(--gb-brand-label)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800,
              fontFamily: 'var(--gb-font-mono)',
            }}>gb</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
                Design System v2 · Golfballs.com Extension
              </div>
              <H1 sub="Token-driven foundation that already works in light or dark. Every primitive below reads only from --gb-* variables — no literal rgba colors anywhere.">
                The system
              </H1>
            </div>
          </div>

          {/* Theme toggle */}
          <div style={{
            display: 'inline-flex', padding: 3, borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', gap: 2,
          }}>
            {[
              { id: 'dark',     icon: <I.moon size={12} />, label: 'Dark' },
              { id: 'midnight', icon: <I.moon size={12} />, label: 'Midnight' },
              { id: 'light',    icon: <I.sun size={12} />,  label: 'Light' },
              { id: 'cream',    icon: <I.sun size={12} />,  label: 'Cream' },
            ].map(t => (
              <button key={t.id} onClick={() => setTheme(t.id)} style={{
                padding: '6px 12px', borderRadius: 6,
                fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                background: theme === t.id ? 'var(--gb-brand-tint-medium)' : 'transparent',
                color: theme === t.id ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all var(--gb-anim)',
              }}>{t.icon}{t.label}</button>
            ))}
          </div>
        </div>

        {/* ─────── AUDIT ─────── */}
        <Block style={{ background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)' }}>
          <H2 num="00" sub="Before we can ship a light theme — or any consistent visual change — the codebase needs to graduate from literal rgba() to semantic tokens.">
            Audit of the current theme system
          </H2>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card padding={14}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 6 }}>What works today</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6, color: 'var(--gb-text-tertiary)' }}>
                <li>~30 <Mono>--gb-*</Mono> tokens covering brand, surfaces, borders, text, error/success/warning, page-injected buttons</li>
                <li>Runtime override via <Mono>chrome.storage.themeColors</Mono> + broadcast</li>
                <li>Same names available in both <Mono>theme.js</Mono> (content scripts) and <Mono>theme.css</Mono> (popup/editor)</li>
              </ul>
            </Card>
            <Card padding={14}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-error-fg)', marginBottom: 6 }}>What blocks a light theme</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6, color: 'var(--gb-text-tertiary)' }}>
                <li><b style={{ color: 'var(--gb-text-secondary)' }}>~200 instances</b> of literal <Mono>rgba(255,255,255,.0X)</Mono> as fills, hovers, borders, scrollbars</li>
                <li><b style={{ color: 'var(--gb-text-secondary)' }}>~50 instances</b> of <Mono>rgba(0,0,0,.X)</Mono> for recess effects and footer strips</li>
                <li>No tokens for: shadows, focus ring, backdrop, scrollbar, fill overlays, on-brand text, status text-on-fill</li>
                <li>Brand tints written as <Mono>rgba(var(--gb-brand-label-rgb), .15)</Mono> in 40+ places — verbose and impossible to swap</li>
              </ul>
            </Card>
          </div>
        </Block>

        {/* ─────── 1. TOKENS ─────── */}
        <div>
          <H2 num="01" sub="Five semantic groups. The 'fill' group is the new addition that makes light theme possible — it auto-inverts based on the active theme.">
            Tokens
          </H2>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <Block>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 4 }}>Surface · page & card backgrounds, layered</div>
              <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginBottom: 14 }}>
                Concrete colors. Goes from "deep" (page edges, header strips) up through "floating" (popovers).
              </div>
              <TokenGrid columns={6} items={[
                { name: 'deep',     varName: '--gb-surface-deep' },
                { name: 'canvas',   varName: '--gb-surface-canvas' },
                { name: 'surface 1', varName: '--gb-surface-1' },
                { name: 'surface 2', varName: '--gb-surface-2' },
                { name: 'surface 3', varName: '--gb-surface-3' },
                { name: 'modal',    varName: '--gb-surface-modal' },
              ]} />
            </Block>

            <Block>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 4 }}>Fill · the new layer that makes theming work</div>
              <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginBottom: 14 }}>
                Semi-transparent overlays. In dark mode they're white-tinted, in light mode they're black-tinted —{' '}
                <b style={{ color: 'var(--gb-text-secondary)' }}>same token, opposite color</b>. Replaces every literal <Mono>rgba(255,255,255,.0X)</Mono>.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 8 }}>
                <Swatch name="faint"   varName="--gb-fill-faint" type="fill" />
                <Swatch name="subtle"  varName="--gb-fill-subtle" type="fill" />
                <Swatch name="soft"    varName="--gb-fill-soft" type="fill" />
                <Swatch name="medium"  varName="--gb-fill-medium" type="fill" />
                <Swatch name="strong"  varName="--gb-fill-strong" type="fill" />
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8 }}>
                Inverse fills · darken on dark, lighten on light
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <Swatch name="inv-soft"   varName="--gb-fill-inverse-soft" type="fill" />
                <Swatch name="inv-medium" varName="--gb-fill-inverse-medium" type="fill" />
                <Swatch name="inv-strong" varName="--gb-fill-inverse-strong" type="fill" />
              </div>
            </Block>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Block>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 14 }}>Border</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <Swatch name="subtle"  varName="--gb-border-subtle" type="border" />
                  <Swatch name="default" varName="--gb-border-default" type="border" />
                  <Swatch name="strong"  varName="--gb-border-strong" type="border" />
                </div>
              </Block>
              <Block>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 14 }}>Text · by role</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Swatch name="Primary"   varName="--gb-text-primary" type="text" />
                  <Swatch name="Secondary" varName="--gb-text-secondary" type="text" />
                  <Swatch name="Tertiary"  varName="--gb-text-tertiary" type="text" />
                  <Swatch name="Muted"     varName="--gb-text-muted" type="text" />
                  <Swatch name="Ghost"     varName="--gb-text-ghost" type="text" />
                  <Swatch name="On brand"  varName="--gb-text-on-brand" type="text" />
                </div>
              </Block>
            </div>

            <Block>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 4 }}>Brand & status · 5-token shape per family</div>
              <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginBottom: 14 }}>
                Every status (brand / error / warning / success) has the same five tokens: solid, fg (text color), tint-soft, tint-medium, tint-border.
                That's all you need for buttons, badges, callouts, focus states.
              </div>
              {[
                { label: 'BRAND',   prefix: '--gb-brand'   },
                { label: 'ERROR',   prefix: '--gb-error'   },
                { label: 'WARNING', prefix: '--gb-warning' },
                { label: 'SUCCESS', prefix: '--gb-success' },
              ].map(({ label, prefix }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, color: 'var(--gb-text-muted)' }}>{label}</div>
                  <Swatch name="solid"       varName={prefix} type="fill" size="sm" />
                  <Swatch name="fg"          varName={`${prefix}-fg`} type="text" size="sm" />
                  <Swatch name="tint-soft"   varName={`${prefix}-tint-soft`} type="fill" size="sm" />
                  <Swatch name="tint-medium" varName={`${prefix}-tint-medium`} type="fill" size="sm" />
                  <Swatch name="tint-border" varName={`${prefix}-tint-border`} type="border" size="sm" />
                </div>
              ))}
              <div style={{ marginTop: 4, padding: 11, background: 'var(--gb-fill-subtle)', borderRadius: 7, fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.55 }}>
                Note: <Mono>--gb-brand-label</Mono> is the same as <Mono>--gb-brand-fg</Mono>. It's the brand color you use{' '}
                for icon strokes, match dots, anchor text, anything that needs to read as "green" against any surface.
              </div>
            </Block>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Block>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 14 }}>Radii</div>
                <Row gap={8}>
                  {[4, 6, 8, 10, 14, 999].map(r => (
                    <div key={r} style={{
                      width: 48, height: 48,
                      background: 'var(--gb-fill-subtle)',
                      border: '1px solid var(--gb-border-default)',
                      borderRadius: r === 999 ? 99 : r,
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                      fontSize: 10, fontFamily: 'var(--gb-font-mono)',
                      color: 'var(--gb-text-muted)', padding: 3,
                    }}>{r === 999 ? '∞' : r}</div>
                  ))}
                </Row>
              </Block>
              <Block>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 14 }}>Shadows</div>
                <Col gap={10}>
                  <div style={{ height: 32, borderRadius: 8, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', boxShadow: 'var(--gb-shadow-popover)', display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                    popover
                  </div>
                  <div style={{ height: 32, borderRadius: 8, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                    modal
                  </div>
                  <div style={{ height: 32, borderRadius: 8, background: 'var(--gb-fill-inverse-medium)', boxShadow: 'var(--gb-focus-ring)', border: '1px solid var(--gb-brand-label)', display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 11, color: 'var(--gb-text-secondary)' }}>
                    focus ring
                  </div>
                </Col>
              </Block>
              <Block>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 14 }}>Type · Geist</div>
                <Col gap={4}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.4 }}>22/800 display</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-primary)' }}>15/700 modal title</div>
                  <div style={{ fontSize: 12, color: 'var(--gb-text-secondary)' }}>12/500 body</div>
                  <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>10/500 meta</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-text-muted)' }}>9.5 section</div>
                  <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-brand-label)' }}>Geist Mono · $1,247.50</div>
                </Col>
              </Block>
            </div>
          </div>
        </div>

        {/* ─────── 1b. THEMING ─────── */}
        <ThemingSection setTheme={setTheme} theme={theme} />

        {/* ─────── 2. BUTTON ─────── */}
        <div>
          <H2 num="02" sub="One <Btn> component with six variants × four sizes. The tinted variant accepts a status prop so the green 'Charge' button and the red 'Refund' button share the same code path.">
            Button
          </H2>

          <Block style={{ marginTop: 18 }}>
            {/* Variants */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Variants</div>
            <Row gap={8}>
              <Btn variant="primary"   icon={<I.send />}>Primary</Btn>
              <Btn variant="secondary" icon={<I.card />}>Secondary</Btn>
              <Btn variant="tinted"    icon={<I.bolt />}>Tinted · brand</Btn>
              <Btn variant="tinted"    icon={<I.alert />} status="error">Tinted · error</Btn>
              <Btn variant="tinted"    icon={<I.eye />}   status="warning">Tinted · warn</Btn>
              <Btn variant="ghost"     icon={<I.cog />}>Ghost</Btn>
              <Btn variant="danger"    icon={<I.trash />}>Danger</Btn>
              <Btn variant="dashed"    icon={<I.plus />}>Dashed (Add new)</Btn>
            </Row>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            {/* Sizes */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Sizes · xs / sm / md / lg</div>
            <Row gap={8} align="center">
              <Btn variant="primary" size="xs" icon={<I.send />}>xs · 22px</Btn>
              <Btn variant="primary" size="sm" icon={<I.send />}>sm · 26px</Btn>
              <Btn variant="primary" size="md" icon={<I.send />}>md · 32px</Btn>
              <Btn variant="primary" size="lg" icon={<I.send />}>lg · 38px</Btn>
            </Row>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            {/* States */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>States</div>
            <Row gap={8}>
              <Btn variant="primary" icon={<I.send />}>Idle</Btn>
              <Btn variant="primary" icon={<I.send />} disabled>Disabled</Btn>
              <Btn variant="primary" loading>Loading</Btn>
              <Btn variant="secondary" icon={<I.check />}>Idle</Btn>
              <Btn variant="secondary" disabled icon={<I.check />}>Disabled</Btn>
              <Btn variant="tinted" status="brand" icon={<I.check />}>Success state</Btn>
            </Row>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            {/* Where this maps */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Where each variant lives in your code</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { v: 'primary',   uses: '.btn-send · .btn-save · .wl-btn-confirm · .gb-btn-primary · sp-btn-submit' },
                { v: 'secondary', uses: '.btn-charge (idle) · .btn-order-edit · .btn-watch-add · .gb-btn-close · .hdr-manage · .upc-btn' },
                { v: 'tinted (brand)',  uses: '.btn-charge.ready · sb-tab.active · .preset-btn.active' },
                { v: 'tinted (error)',  uses: '.btn-charge.refund · .btn-watch-show.has-critical · .ccm-flag-chip.junk' },
                { v: 'ghost',     uses: '.btn-icon · .gb-rte-btn · .btn-back · .tpl-item:hover (variant)' },
                { v: 'danger',    uses: '.btn-del · .btn-reset-all · .upc-btn.danger' },
                { v: 'dashed',    uses: '.btn-sb-new (+ New Template) · .btn-add' },
              ].map(({ v, uses }) => (
                <div key={v} style={{ padding: 10, background: 'var(--gb-fill-subtle)', borderRadius: 6, border: '1px solid var(--gb-border-subtle)' }}>
                  <Mono>{v}</Mono>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 5, lineHeight: 1.5 }}>{uses}</div>
                </div>
              ))}
            </div>
          </Block>
        </div>

        {/* ─────── 3. ICON BUTTON ─────── */}
        <div>
          <H2 num="03" sub="Square buttons that hold just an icon. Most-used variant is the close button at the top-right of every modal — but also row-delete actions, header settings gear, RTE toolbar buttons.">
            Icon button
          </H2>

          <Block style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Sizes</div>
            <Row gap={10} align="center">
              <IconBtn size="xs" icon={<I.close />} />
              <IconBtn size="sm" icon={<I.close />} />
              <IconBtn size="md" icon={<I.close />} />
              <IconBtn size="lg" icon={<I.close />} />
              <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginLeft: 12 }}>22 · 26 · 32 · 38</span>
            </Row>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Variants</div>
            <Row gap={10}>
              <IconBtn icon={<I.cog />} />
              <IconBtn icon={<I.edit />} />
              <IconBtn icon={<I.copy />} />
              <IconBtn icon={<I.more />} />
              <IconBtn icon={<I.trash />} danger />
              <IconBtn icon={<I.close />} variant="ghost" />
            </Row>
          </Block>
        </div>

        {/* ─────── 4. TAG / CHIP / DOT ─────── */}
        <div>
          <H2 num="04" sub="Three small label primitives. Tags are uppercase status badges. Chips are mixed-case (variables, filters). Dots are 6–10px filled circles, optional glow for match indicators.">
            Tags, chips, dots
          </H2>

          <Block style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Tag · 4 tones × 4 sizes</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
              {[
                { label: 'neutral', tone: 'neutral' },
                { label: 'brand',   tone: 'brand' },
                { label: 'error',   tone: 'error' },
                { label: 'warning', tone: 'warning' },
                { label: 'success', tone: 'success' },
              ].map(t => (
                <React.Fragment key={t.tone}>
                  <Mono>{t.tone}</Mono>
                  <Row gap={6}>
                    <Tag tone={t.tone} size="xs">xs · 9px</Tag>
                    <Tag tone={t.tone} size="sm">sm · matched</Tag>
                    <Tag tone={t.tone} size="md">md · critical</Tag>
                    <Tag tone={t.tone} size="lg">lg · with hdr</Tag>
                    <Tag tone={t.tone} size="sm" mono>MONO</Tag>
                  </Row>
                </React.Fragment>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Chip · variable/filter style</div>
            <Row gap={5}>
              <Chip code>{`{{order_number}}`}</Chip>
              <Chip code>{`{{customer_name}}`}</Chip>
              <Chip code onRemove>{`{{rep_name}}`}</Chip>
              <Chip tone="neutral">type = Contact</Chip>
              <Chip tone="neutral" onRemove>state = CA</Chip>
            </Row>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Dot · match indicator</div>
            <Row gap={14}>
              {[
                { tone: 'brand',   label: 'matched · glow' },
                { tone: 'brand',   label: 'matched · no glow', glow: false },
                { tone: 'muted',   label: 'unmatched' },
                { tone: 'error',   label: 'critical' },
                { tone: 'warning', label: 'pending' },
              ].map((d, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                  <Dot tone={d.tone} glow={d.glow !== false} /> {d.label}
                </div>
              ))}
            </Row>
          </Block>
        </div>

        {/* ─────── 5. FORM CONTROLS ─────── */}
        <div>
          <H2 num="05" sub="Single visual shape across Input · Textarea · Dropdown. All share inputBaseStyle() — they recess into the surface using --gb-fill-inverse-medium, so they look right against any background.">
            Form controls
          </H2>

          <Block style={{ marginTop: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Idle"><Input placeholder="Type something…" /></Field>
              <Field label="Filled"><Input value="ORD-29481" mono /></Field>
              <Field label="Focused"><Input value="marcus@acme.co" focused mono /></Field>
              <Field label="Error" hint="That account ID doesn't exist."><Input value="A-99999" error mono /></Field>
              <Field label="Leading icon"><Input value="Search contacts" leading={<I.search />} /></Field>
              <Field label="With $ prefix"><Input value="1,247.50" mono leading={<span style={{ color: 'var(--gb-brand-label)', fontWeight: 800, fontSize: 13 }}>$</span>} /></Field>
              <Field label="Dropdown idle"><Dropdown value="Order Edit" /></Field>
              <Field label="Dropdown open"><Dropdown value="Smart detect" open /></Field>
              <Field label="Dropdown empty"><Dropdown placeholder="Select industry…" /></Field>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <Field label="Textarea"><Textarea rows={3} value="One-color print, white on black. Repeat artwork from PO-22841." /></Field>
              <Field label="Switch · 3 sizes" hint="sm 28 · md 34 · lg 40">
                <Row gap={14} align="center" style={{ height: 32 }}>
                  <Switch on size="sm" />
                  <Switch on size="md" />
                  <Switch on size="lg" />
                  <Switch on={false} size="md" />
                </Row>
              </Field>
            </div>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Pill tag · exclusive & toggle (proof modal)</div>
            <Field label="Order type" hint="Exclusive — one of these on at a time">
              <Row gap={5}>
                <PillTag on>Live Order</PillTag>
                <PillTag>Sample</PillTag>
                <PillTag>Quote</PillTag>
                <PillTag>Reorder</PillTag>
              </Row>
            </Field>
            <div style={{ height: 10 }} />
            <Field label="Flags" hint="Independent toggles">
              <Row gap={5}>
                <PillTag on  icon={<I.bolt size={10} />}>Rush</PillTag>
                <PillTag      icon={<I.eye size={10} />}>Canada Drop</PillTag>
                <PillTag      icon={<I.send size={10} />}>Drop Ship TS</PillTag>
              </Row>
            </Field>
          </Block>
        </div>

        {/* ─────── 5b. CALLOUT / CHECKBOX / SLIDER ─────── */}
        <div>
          <H2 num="05b" sub="Three more primitives I missed on the first pass: callouts (5 tones, replaces .note-callout), real checkboxes (for list/table selection, distinct from the switch), and slider bars.">
            Callouts, checkboxes, sliders
          </H2>

          <Block style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Callout · 5 tones · same left-border accent as .note-callout</div>
            <Col gap={8}>
              <Callout tone="info" title="Smart Triggers">
                This template activates when its match rules pass on an order page. Use <Mono>{`{{var}}`}</Mono> tokens to inject DOM-extracted data.
              </Callout>
              <Callout tone="brand" title="Case Reply Template">
                Matches against the From / Subject / Body of incoming case emails. Variables are extracted by regex from those same fields.
              </Callout>
              <Callout tone="success" title="Saved" dismissable>
                Template synced across all open tabs.
              </Callout>
              <Callout tone="warning" title="Heads up">
                Conditions are evaluated against the contact's live Solr record. Leave empty to always match.
              </Callout>
              <Callout tone="error" title="Charge failed" icon={<I.alert />}>
                The processor returned <Mono>insufficient_funds</Mono>. Suggest the customer update their card before retrying.
              </Callout>
              <Callout tone="neutral" icon={false}>
                No icon. No title. Just a quiet hint sitting at the bottom of a form.
              </Callout>
            </Col>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              {/* Checkboxes */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Checkbox · distinct from switch</div>
                <Col gap={8}>
                  <Row gap={16} align="center">
                    <Checkbox checked size="sm" />
                    <Checkbox checked size="md" />
                    <Checkbox checked size="lg" />
                    <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>14 · 17 · 20</span>
                  </Row>

                  <div style={{
                    padding: 12,
                    background: 'var(--gb-fill-subtle)',
                    borderRadius: 7,
                    border: '1px solid var(--gb-border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <Checkbox checked indeterminate label="Select all" hint="2 of 5 selected" />
                    <div style={{ marginLeft: 26, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Checkbox checked label="Charge Error Follow-Up" />
                      <Checkbox checked label="Shipping Delay Notice" />
                      <Checkbox label="Proof Approval Request" />
                      <Checkbox label="Logo Revision Quote" />
                      <Checkbox disabled label="Net-30 Reminder" hint="disabled — missing template body" />
                    </div>
                  </div>

                  <Checkbox tone="error" checked label="Mark this case as Junk" hint="Closes the case and moves it out of the inbox." />
                </Col>
              </div>

              {/* Sliders */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Slider · single value</div>
                <Col gap={14}>
                  <Field label="Default delay (sec)">
                    <Slider value={60} min={5} max={600} unit="s" />
                  </Field>
                  <Field label="Jitter ± (sec)" hint="Random delay variation">
                    <Slider value={20} min={0} max={300} unit="s" showRange />
                  </Field>
                  <Field label="Margin target %">
                    <Slider value={34} min={20} max={60} unit="%" ticks={[25, 30, 35, 40, 45, 50, 55]} />
                  </Field>
                  <Field label="Throttle (warning tone)">
                    <Slider value={75} min={0} max={100} tone="warning" unit="%" />
                  </Field>
                </Col>

                <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '18px 0' }} />

                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Range slider · two thumbs</div>
                <Col gap={14}>
                  <Field label="Order value range" hint="For CRM Search filter">
                    <RangeSlider values={[500, 5000]} min={0} max={10000} unit="$" />
                  </Field>
                  <Field label="Send window (24h)" hint="Campaign editor business hours">
                    <RangeSlider values={[9, 17]} min={0} max={24} unit="h" showRange ticks={[6, 12, 18]} />
                  </Field>
                  <Field label="Margin alert range">
                    <RangeSlider values={[28, 42]} min={0} max={80} unit="%" tone="warning" />
                  </Field>
                </Col>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>Switch-tag · label + state in one control</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginBottom: 12, lineHeight: 1.55, maxWidth: 640 }}>
              For inline feature toggles and per-row enable controls. The tag carries the label, the embedded switch carries the state.
              Replaces the awkward "label + separate switch" pattern in the settings panel.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <Col gap={8}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)' }}>Sizes · sm / md / lg</div>
                <Row gap={6}>
                  <SwitchTag on  size="sm" label="Enabled" />
                  <SwitchTag on  size="md" label="Enabled" />
                  <SwitchTag on  size="lg" label="Enabled" />
                </Row>
                <Row gap={6}>
                  <SwitchTag size="sm" label="Disabled" />
                  <SwitchTag size="md" label="Disabled" />
                  <SwitchTag size="lg" label="Disabled" />
                </Row>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginTop: 8 }}>With icons</div>
                <Row gap={6}>
                  <SwitchTag on label="Charge Card"   icon={<I.card />} />
                  <SwitchTag on label="Watch List"    icon={<I.eye />} />
                  <SwitchTag    label="Phone Finder"  icon={<I.search />} />
                  <SwitchTag on tone="warning" label="Dev mode" icon={<I.bolt />} />
                </Row>
              </Col>
              <Col gap={8}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)' }}>Use case · settings panel feature flags</div>
                <div style={{
                  padding: 12,
                  background: 'var(--gb-fill-subtle)',
                  border: '1px solid var(--gb-border-subtle)',
                  borderRadius: 'var(--gb-r-md)',
                }}>
                  <Row gap={5}>
                    <SwitchTag on label="Charge Card"     icon={<I.card />} />
                    <SwitchTag on label="Order Edit"      icon={<I.edit />} />
                    <SwitchTag on label="Submit Proof" />
                    <SwitchTag on label="Watchlist"       icon={<I.eye />} />
                    <SwitchTag    label="Phone Finder" />
                    <SwitchTag on label="My Tasks"        icon={<I.check />} />
                    <SwitchTag    label="Signifyd Glow" />
                    <SwitchTag on label="Calendar" />
                    <SwitchTag    label="Auto Push" />
                    <SwitchTag on tone="warning" label="Dev Mode" icon={<I.bolt />} />
                  </Row>
                </div>
              </Col>
            </div>
          </Block>
        </div>

        {/* ─────── 6. MODAL PATTERN ─────── */}
        <div>
          <H2 num="06" sub="Every injected modal in the extension follows the same three-zone pattern. The header always gets a 30px icon tile, title (13px/700), subtitle (11px/muted), optional right-side meta, and a close IconBtn. The footer always lives over an inverse-fill recess.">
            Modal · header / body / footer
          </H2>

          <Block style={{ marginTop: 18 }}>
            <Row gap={28} align="flex-start" wrap={false} style={{ overflow: 'auto' }}>
              {/* Schematic */}
              <Col gap={8} style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Anatomy</div>
                <ModalShell width={460} height={400}>
                  <ModalHeader icon={<I.card />} title="Modal Title" subtitle="Subtitle context · meta" right={<Tag tone="brand" size="sm" style={{ marginRight: 6 }}>STATE</Tag>} />
                  <div style={{
                    flex: 1, padding: 16,
                    display: 'flex', flexDirection: 'column', gap: 10,
                    background: 'var(--gb-surface-canvas)',
                  }}>
                    <SectionLabel>Section A</SectionLabel>
                    <Card>
                      <KeyVal k="Order" v="#ORD-29481" mono tone="ok" />
                      <KeyVal k="Customer" v="Acme Industries" />
                      <KeyVal k="Total" v="$1,247.50" mono />
                    </Card>
                    <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />}>Add</Btn>}>Section B</SectionLabel>
                    <Row gap={6}>
                      <Tag tone="brand">MATCHED</Tag>
                      <Tag tone="error">CRITICAL</Tag>
                      <Tag tone="warning">HOLD</Tag>
                    </Row>
                  </div>
                  <ModalFooter>
                    <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Optional hint text</div>
                    <Btn variant="ghost">Cancel</Btn>
                    <Btn variant="primary" icon={<I.check />}>Confirm</Btn>
                  </ModalFooter>
                </ModalShell>
              </Col>

              {/* Annotations */}
              <Col gap={10} style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Three-zone contract</div>
                {[
                  { z: 'Header',  bg: '--gb-fill-inverse-strong',  el: '30px icon tile + title/subtitle + right meta + close', font: '13/700 title · 11/500 subtitle' },
                  { z: 'Body',    bg: '--gb-surface-canvas',       el: 'Scrollable. Sections via <SectionLabel>. Forms in 2-col / 3-col grid.', font: '12/500 body · 9.5/700 uppercase labels' },
                  { z: 'Footer',  bg: '--gb-fill-inverse-strong',  el: 'Hint · Cancel · Primary (right-aligned). Optional Destroy at far left.', font: 'Btn md · 32px tall' },
                ].map((s) => (
                  <Card key={s.z}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{s.z}</span>
                      <Mono>{s.bg}</Mono>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>{s.el}</div>
                    <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 4 }}>{s.font}</div>
                  </Card>
                ))}
              </Col>
            </Row>
          </Block>
        </div>
        {/* ─────── 6b. NOTIFICATIONS ─────── */}
        <NotificationIdeasSection />

        {/* ─────── 6d. FEATURE TOGGLE VARIATIONS ─────── */}
        <FeatureToggleSection />

        {/* ─────── 6e. COLOR SPOTLIGHTS ─────── */}
        <ColorSpotlightSection />

        {/* ─────── 6f. EXPANDABLE FEATURES ─────── */}
        <ExpandableFeatureSection />

        {/* ─────── 7. MIGRATION ─────── */}
        <div>
          <H2 num="07" sub="What it takes to switch the extension over. Phase 1 is non-disruptive — adopting tokens — and Phase 2 actually adopts React.">
            Migration plan
          </H2>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Block>
              <Tag tone="brand" size="md">PHASE 1</Tag>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 10 }}>Tokenize the existing CSS</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 5, lineHeight: 1.6 }}>
                Vanilla JS / HTML stays exactly as it is. We do a find/replace across all <Mono>content/*.js</Mono> files:
              </div>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 11.5, lineHeight: 1.65, color: 'var(--gb-text-tertiary)' }}>
                <li><Mono>rgba(255,255,255,.05)</Mono> → <Mono>var(--gb-fill-subtle)</Mono></li>
                <li><Mono>rgba(255,255,255,.08)</Mono> → <Mono>var(--gb-fill-soft)</Mono></li>
                <li><Mono>rgba(0,0,0,.3)</Mono> → <Mono>var(--gb-fill-inverse-medium)</Mono></li>
                <li><Mono>rgba(0,0,0,.4)</Mono> → <Mono>var(--gb-fill-inverse-strong)</Mono></li>
                <li><Mono>rgba(var(--gb-brand-label-rgb), .15)</Mono> → <Mono>var(--gb-brand-tint-medium)</Mono></li>
              </ul>
              <div style={{ marginTop: 14, padding: 10, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 6, fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                After Phase 1, light theme works — you flip <Mono>document.documentElement.dataset.theme = 'light'</Mono>{' '}
                and every surface adapts.
              </div>
            </Block>

            <Block>
              <Tag tone="warning" size="md">PHASE 2</Tag>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 10 }}>Adopt React per surface</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 5, lineHeight: 1.6 }}>
                One modal at a time, replace the manual <Mono>innerHTML</Mono> generation with React. Suggested order — easiest first:
              </div>
              <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 11.5, lineHeight: 1.65, color: 'var(--gb-text-tertiary)' }}>
                <li>popup.html (small, isolated, no iframe)</li>
                <li>charge.html (already its own document)</li>
                <li>Watchlist + Task List modals (simple list UIs)</li>
                <li>Margin Calculator + Submit Proof</li>
                <li>CRM Create Contact</li>
                <li>CRM Search + Query Builder (data-heavy)</li>
                <li>Campaign Builder (most complex)</li>
                <li>editor.html (full-tab manager) — last</li>
              </ol>
              <div style={{ marginTop: 14, padding: 10, background: 'var(--gb-fill-subtle)', borderRadius: 6, fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>
                Each modal becomes a single React tree mounted into a <Mono>{`<div id="__gb-X-root">`}</Mono>.
                The primitives in this page are the shared library — they live next to <Mono>theme.js</Mono>.
              </div>
            </Block>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 20, padding: '18px 20px',
          background: 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-md)',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <Dot tone="brand" glow size={8} />
          <div style={{ flex: 1, fontSize: 11.5, color: 'var(--gb-text-tertiary)' }}>
            Toggle the theme at the top — every primitive on this page reads only from <Mono>--gb-*</Mono> tokens.
            That's the deal: anything you build with these stays consistent and themeable forever.
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DesignSystem />);
