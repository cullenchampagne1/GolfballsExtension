/* page-popup.jsx — DEEP page: the toolbar popup.
   Restructured into focused TourBoxes so each explanation sits beside
   the live control it describes. */
(function () {
  const { useState } = React;
  const { I, Btn, TemplatePicker, KeyVal, Tag, Dot, SectionLabel } = window.GB;
  const LiveStage = window.LiveStage;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

  /* sample order templates for the focused picker snippet */
  const SAMPLE_TPLS = [
    { id: 'tpl_ship', name: 'Order Shipped', type: 'order', variations: [{ id: 'a', preview: 'Warmer tone' }, { id: 'b', preview: 'Brief' }] },
    { id: 'tpl_proof', name: 'Art Proof Ready', type: 'order', variations: [] },
    { id: 'tpl_back', name: 'Backorder Notice', type: 'order', variations: [] },
  ];

  function PickerSnippet() {
    const [val, setVal] = useState('tpl_ship');
    return (
      <MiniFrame width={300} label="popup · template section" pad>
        <div style={{ fontFamily: 'var(--gb-font-sans)' }}>
          <SectionLabel divider={false} style={{ marginBottom: 4 }}>Template</SectionLabel>
          <TemplatePicker mode="single" templates={SAMPLE_TPLS} matchedIds={['tpl_ship']} value={val} onChange={setVal} placeholder="Pick a template" listMaxHeight={220} />
        </div>
      </MiniFrame>
    );
  }

  function ActionsSnippet() {
    const Ic = {
      watch: (p) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      checkbox: (p) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
      clip: (p) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
    };
    return (
      <MiniFrame width={300} label="popup · actions" pad>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Btn full size="sm" variant="tinted" status="brand" icon={<I.card />}>Charge Card  ($100.00)</Btn>
          <Btn full size="sm" icon={<I.edit />}>Order Edit</Btn>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" icon={<I.eye />} style={{ flex: 1, width: 'auto' }}>Watch Order</Btn>
            <Btn size="sm" variant="tinted" status="error" icon={<Ic.watch />} badge={2} badgeTone="error" badgePulse style={{ flex: 1, width: 'auto' }}>Watch List</Btn>
          </div>
          <Btn full size="sm" icon={<Ic.checkbox />}>My Tasks</Btn>
          <Btn full size="sm" icon={<I.search />}>CRM Search</Btn>
          <Btn full size="sm" icon={<Ic.clip />}>Submit Proof</Btn>
        </div>
      </MiniFrame>
    );
  }

  function SendSnippet() {
    return (
      <MiniFrame width={300} label="popup · review & send" pad>
        <div>
          <KeyVal k="To" v="jordan.lee@example.com" tone="ok" />
          <KeyVal k="first_name" v="Jordan" />
          <KeyVal k="order_no" v="4815162342" />
          <KeyVal k="tracking" v="1Z999AA10123456784" />
          <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />
          <Btn full variant="primary" size="md" icon={<I.send />}>Open in Outlook</Btn>
        </div>
      </MiniFrame>
    );
  }

  function HeaderSnippet() {
    return (
      <MiniFrame width={300} label="popup · header" pad={false}>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-surface-1)', borderRadius: 'var(--gb-r-md)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.mail size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Email Templates</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1 }}>Golfballs.com · 5 templates</div>
          </div>
          <Btn size="sm" icon={<I.cog />}>Manage</Btn>
        </div>
      </MiniFrame>
    );
  }

  const STEPS = [
    { target: 'picker', caption: 'Click the toolbar icon and the popup opens, instantly scanning the page. On an order page it matches any templates whose rules fit — here, “Order Shipped”.', hold: 2400 },
    { target: 'picker', caption: 'Open the list — matched templates are grouped at the top with a glowing dot.', run: (api) => api.openPicker(true), hold: 1900 },
    { target: 'picker', caption: 'Pick one. Variables will resolve from the live order.', run: (api) => { api.selectTemplate('tpl_ship'); api.openPicker(false); }, hold: 2000 },
    { target: 'resolved', caption: 'The To address and every {{variable}} fill in automatically — no copy-paste.', hold: 2400 },
    { target: 'charge', caption: 'Action buttons operate on the current order. Charge shows the $100 gap between total and captured.', hold: 2400 },
    { target: 'send', caption: 'Send opens the finished email in Outlook — or sends via Power Automate if configured.', hold: 2200 },
  ];

  function PopupPage() {
    const buildChrome = () => window.GBMock.createChrome();
    return (
      <div className="prose">
        <div className="eyebrow">The Daily Driver</div>
        <h1 className="title">The Popup</h1>
        <p className="lede">
          The popup is where most of a rep's day happens. Click the Golfballs icon in the toolbar and a
          compact panel opens that already knows what page you're on. Watch it work below, then read through
          each section — every part is shown live, right next to its explanation.
        </p>

        {LiveStage && (
          <LiveStage
            width={320}
            frameKind="popup"
            frameLabel="golfballs.com/admin/order/4815162342"
            buildChrome={buildChrome}
            render={(chrome, apiRef, helpers) => <window.PopupLive chrome={chrome} ref={apiRef} onToast={helpers.showToast} />}
            callouts={[]}
            steps={STEPS}
            note="Live popup · sample order #4815162342 · press Play to watch, or Try it yourself."
          />
        )}

        <h2 className="sec">Walk through it, piece by piece</h2>
        <p>Each block below pairs the real, clickable control with what it does. Hover and click the snippets — they're live.</p>

        {TourBox && (<>
          <TourBox n={1} eyebrow="Header" title="Where you are, and the way out" live={<HeaderSnippet />} flip>
            <p>The popup's header shows the brand, the site, and how many templates you have. The <strong>Manage</strong> button opens the full editor — templates, settings, themes — covered in <a href="#settings">Settings &amp; Manager</a>.</p>
          </TourBox>

          <TourBox n={2} eyebrow="Step 1 · Choose" title="The template picker" live={<PickerSnippet />}>
            <p>Pick which email to send. Templates valid for the current page show here; the ones that <strong>match this exact order</strong> are grouped at the top with a glowing dot.</p>
            <p>Click the bar to open it. A <code>2v</code> chip means the template carries variations — expand the row to <strong>pin one</strong>, or leave it on the parent to send a random variation each time. (Try it — this picker is live.)</p>
          </TourBox>

          <TourBox n={3} eyebrow="Step 2 · Act" title="Action buttons" live={<ActionsSnippet />} flip>
            <p>These operate on the current order:</p>
            <ul>
              <li><strong>Charge / Refund</strong> — collect the unpaid balance. The amount is the gap between order total and what's captured.</li>
              <li><strong>Order Edit</strong> — open the edit modal on the page.</li>
              <li><strong>Watch</strong> — flag this record for follow-up; the list badge turns <strong>red</strong> after 6 hours.</li>
              <li><strong>Tasks · CRM Search · Submit Proof</strong> — open those tools without leaving the order.</li>
            </ul>
            <p>A greyed button just means the page lacks the data it needs yet.</p>
          </TourBox>

          <TourBox n={4} eyebrow="Step 3 · Send" title="Review &amp; send" live={<SendSnippet />}>
            <p>Before sending, the popup shows exactly what will go out: the resolved <code>To</code> address (green when found) and each variable's value, pulled from the live order.</p>
            <p>Send opens the finished email in <strong>Outlook</strong>. If your team has <a href="#settings">Power Automate</a> configured, it sends directly instead and the button reads “Send”. If <code>To</code> shows <strong>Not found</strong>, the page didn't expose a customer email — open the contact or pick a different template.</p>
          </TourBox>
        </>)}

        <div className="docnote brand" style={{ marginTop: 26 }}>
          <span className="dn-ico">{I.cog({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">Missing a button?</div>
            <p style={{ margin: 0 }}>Every action is gated by a toggle in <a href="#settings">Settings → Features</a>. If Charge, Tasks, or the whole template section is gone, it's switched off — flip it back on and it slides back in. The popup also re-shapes itself per page: order pages get order tools, contact/account pages swap to account templates.</p>
          </div>
        </div>
      </div>
    );
  }

  window.GBPages['popup'] = { title: 'The Popup', group: 'Daily Driver', icon: 'mail', render: () => <PopupPage /> };
})();
