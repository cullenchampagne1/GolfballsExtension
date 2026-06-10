/* page-viewers.jsx — On-page viewers:
   • Email / Chat Viewer (one page — email thread + chat transcript)
   • Image Viewer (its own page)
   • 3D Golfball Viewer (its own page)
   Ported from EmailPreview / TextPreview / ImagePreview / GolfballViewer. */
(function () {
  const { useState, useRef, useEffect } = React;
  const { I, Btn, Tag, Dot, Input } = window.GB;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

  /* hue-stable avatar (matches EmailPreview/TextPreview Avatar) */
  function hueFromString(s) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function Avatar({ name, email, size = 32 }) {
    const hue = hueFromString(email || name);
    const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, position: 'relative', background: `hsl(${hue} 45% 30%)`, border: `1px solid hsl(${hue} 45% 45%)` }}>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: `hsl(${hue} 70% 85%)` }}>{initials}</span>
      </div>
    );
  }

  function ViewToggle({ value, onChange, options }) {
    return (
      <div style={{ display: 'inline-flex', gap: 2, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 2 }}>
        {options.map((o) => { const on = value === o.id; return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600 }}>{o.icon}{o.label}</button>
        ); })}
      </div>
    );
  }

  /* ============ CATEGORIZE RAIL (case mode) ============ */
  const CATS = [
    { id: 'order', label: 'Order Issue', subs: ['Wrong item', 'Damaged', 'Late delivery', 'Missing item'] },
    { id: 'art', label: 'Art / Proof', subs: ['Proof revision', 'Logo file', 'Approval'] },
    { id: 'billing', label: 'Billing', subs: ['Refund', 'Overcharge', 'Invoice'] },
    { id: 'sales', label: 'Sales / Quote', subs: ['New quote', 'Reorder', 'Bulk pricing'] },
  ];
  function CategorizeRail({ recommended }) {
    const [open, setOpen] = useState('order');
    const [pick, setPick] = useState(null);
    return (
      <div style={{ width: 248, flexShrink: 0, borderLeft: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Categorize case</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 2 }}>Pick a category, then a reason</div>
        </div>
        {recommended && (
          <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-brand-tint-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', marginBottom: 6 }}><I.bolt size={10} /> Recommended</div>
            <button onClick={() => { setOpen('order'); setPick('Damaged'); }} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-brand-tint-border)', background: 'var(--gb-surface-modal)', cursor: 'pointer', fontFamily: 'inherit' }}><Dot tone="brand" glow size={5} /><span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>Order Issue · Damaged</span></button>
          </div>
        )}
        <div className="gb-thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 7 }}>
          {CATS.map((c) => (
            <div key={c.id} style={{ marginBottom: 2 }}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 'var(--gb-r-sm)', border: 'none', background: open === c.id ? 'var(--gb-fill-subtle)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={{ color: 'var(--gb-text-muted)', display: 'flex', transform: open === c.id ? 'none' : 'rotate(-90deg)', transition: 'transform .18s' }}><I.chevd size={11} /></span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{c.label}</span>
              </button>
              {open === c.id && (
                <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
                  {c.subs.map((s) => { const on = pick === s; return (
                    <button key={s} onClick={() => setPick(s)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 'var(--gb-r-sm)', border: 'none', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <Dot tone={on ? 'brand' : 'muted'} size={4} glow={on} /><span style={{ fontSize: 11, fontWeight: on ? 600 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)' }}>{s}</span>
                    </button>
                  ); })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: 11, borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', gap: 7 }}>
          <Btn size="sm" variant="ghost" style={{ flex: 1 }}>Mark junk</Btn>
          <Btn size="sm" variant="tinted" status="brand" disabled={!pick} style={{ flex: 1 }}>Apply</Btn>
        </div>
      </div>
    );
  }

  /* ============ EMAIL THREAD ============ */
  const THREAD = [
    { id: 'm1', name: 'Caleb Twachtman', email: 'caleb@brightlinegolf.com', dir: 'in', date: 'Mon 5/27 · 9:14 AM', body: "Hi — the dozen we received last week have the wrong logo color. We ordered navy (PMS 289) but these came in royal blue. Can we get a corrected run?\n\nThanks,\nCaleb" },
    { id: 'm2', name: 'Pat Morrison', email: 'pat@golfballs.com', dir: 'out', date: 'Mon 5/27 · 10:02 AM', body: "Hi Caleb — so sorry about that. I've pulled the original art and you're right, the spec says PMS 289. I'll get a corrected proof to you today and reship at no charge.\n\nBest,\nPat" },
    { id: 'm3', name: 'Caleb Twachtman', email: 'caleb@brightlinegolf.com', dir: 'in', date: 'Mon 5/27 · 10:20 AM', body: "Perfect, thank you! As long as it's here before the 10th we're good." },
  ];
  function MessageCard({ msg, expanded, onToggle }) {
    const isOut = msg.dir === 'out';
    return (
      <div style={{ border: '1px solid ' + (isOut ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-md)', background: isOut ? 'color-mix(in srgb, var(--gb-brand-label) 6%, var(--gb-surface-1))' : 'var(--gb-surface-1)', overflow: 'hidden' }}>
        <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
          <Avatar name={msg.name} email={msg.email} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{msg.name}</span>
              <Tag size="xs" tone={isOut ? 'brand' : 'neutral'}>{isOut ? 'US' : 'CUSTOMER'}</Tag>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{msg.date}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expanded ? msg.email : msg.body.replace(/\n/g, ' ').slice(0, 64)}</div>
          </div>
          <span style={{ color: 'var(--gb-text-muted)', display: 'flex', transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}><I.chevd size={13} /></span>
        </button>
        <div style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows .3s cubic-bezier(.4,0,.2,1)' }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--gb-border-subtle)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--gb-text-secondary)', whiteSpace: 'pre-wrap' }}>{msg.body}</div>
          </div>
        </div>
      </div>
    );
  }
  function EmailViewerSnippet() {
    const [mode, setMode] = useState('inbox'); // inbox | case
    const [exp, setExp] = useState(() => new Set(['m1', 'm2', 'm3']));
    const toggle = (id) => setExp((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const isCase = mode === 'case';
    return (
      <MiniFrame width={isCase ? 760 : 560} label="modal · Email preview" pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-inverse-strong)' }}>
          <span style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.mail size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: -0.2, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Wrong logo color on recent order</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Caleb Twachtman · 3 messages{isCase ? ' · Case #C-4471' : ''}</div>
          </div>
          <ViewToggle value={mode} onChange={setMode} options={[{ id: 'inbox', label: 'Inbox', icon: <I.mail size={11} /> }, { id: 'case', label: 'Case', icon: <I.grid size={11} /> }]} />
        </div>
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="gb-thin-scroll" style={{ maxHeight: 300, overflowY: 'auto', padding: 13, display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--gb-surface-canvas)' }}>
              {THREAD.map((m) => <MessageCard key={m.id} msg={m} expanded={exp.has(m.id)} onToggle={() => toggle(m.id)} />)}
            </div>
            {!isCase && (
              <div style={{ padding: '9px 13px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 9 }}>
                <Btn size="sm" variant="tinted" status="brand" icon={<I.send size={11} />}>Reply to Caleb</Btn>
                <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>opens the rich reply composer</span>
              </div>
            )}
          </div>
          {isCase && <CategorizeRail recommended />}
        </div>
      </MiniFrame>
    );
  }

  /* ============ CHAT TRANSCRIPT ============ */
  const CHAT = [
    { kind: 'system', body: 'Chat started', time: '2:31 PM' },
    { kind: 'visitor', name: 'Website Visitor', time: '2:31 PM', body: "Hi, do your custom golf balls come in matte finish?" },
    { kind: 'agent', name: 'Dana (Golfballs)', time: '2:32 PM', body: "Hi! Yes — our Tour Soft and Pro line both offer a matte option. Were you looking to add a logo as well?" },
    { kind: 'visitor', name: 'Website Visitor', time: '2:33 PM', body: "Yes, a one-color logo. About 300 dozen for an event in August." },
    { kind: 'agent', name: 'Dana (Golfballs)', time: '2:34 PM', body: "Perfect — for 300 dozen with a one-color print we can definitely hit an August date. I'll have a rep send a quote. What's the best email?" },
    { kind: 'note', body: 'Visitor qualified — 300 dz, 1-color, Aug deadline. Routed to inside sales.' },
    { kind: 'link', body: 'https://app.snapengage.com/transcript/884201' },
  ];
  function ChatBubble({ msg, prev }) {
    if (msg.kind === 'system') return <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /><span style={{ padding: '3px 10px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', fontSize: 10, fontWeight: 600, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{msg.body}{msg.time ? ` · ${msg.time}` : ''}</span><div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /></div>;
    if (msg.kind === 'link') { const url = (msg.body.match(/https?:\/\/\S+/) || [''])[0]; return <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}><div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /><a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-pill)', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', textDecoration: 'none', whiteSpace: 'nowrap' }}><I.bolt size={10} /> View full transcript on SnapEngage</a><div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /></div>; }
    if (msg.kind === 'note') return <div style={{ margin: '10px 0', padding: '9px 12px', background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)', borderRadius: 'var(--gb-r-md)', fontSize: 12, lineHeight: 1.55, color: 'var(--gb-text-secondary)' }}><span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-warning-fg)', marginRight: 8 }}>Note</span>{msg.body}</div>;
    const isAgent = msg.kind === 'agent';
    const hue = hueFromString(msg.name);
    const samePrev = prev && prev.kind === msg.kind && prev.name === msg.name;
    return (
      <div style={{ display: 'flex', flexDirection: isAgent ? 'row-reverse' : 'row', gap: 10, marginTop: samePrev ? 2 : 12 }}>
        <div style={{ width: 28, flexShrink: 0 }}>{!samePrev && <Avatar name={msg.name} size={28} />}</div>
        <div style={{ maxWidth: 'min(76%, 360px)', display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-end' : 'flex-start' }}>
          {!samePrev && <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 10.5, color: 'var(--gb-text-muted)', marginBottom: 3 }}><span style={{ fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{msg.name}</span><span style={{ fontFamily: 'var(--gb-font-mono)' }}>{msg.time}</span></div>}
          <div style={{ padding: '9px 14px', fontSize: 12.5, lineHeight: 1.55, borderRadius: isAgent ? 'var(--gb-r-md) var(--gb-r-md) var(--gb-r-xs) var(--gb-r-md)' : 'var(--gb-r-md) var(--gb-r-md) var(--gb-r-md) var(--gb-r-xs)', background: isAgent ? 'color-mix(in srgb, var(--gb-brand-label) 10%, var(--gb-surface-1))' : 'var(--gb-surface-2)', border: '1px solid ' + (isAgent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'), color: 'var(--gb-text-primary)', whiteSpace: 'pre-wrap' }}>{msg.body}</div>
        </div>
      </div>
    );
  }
  function ChatViewerSnippet() {
    const ChatIcon = (p) => <svg width={p.size || 15} height={p.size || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    const visibleCount = CHAT.filter((m) => m.kind === 'visitor' || m.kind === 'agent').length;
    return (
      <MiniFrame width={560} label="modal · Chat preview" pad={false}>
        <div style={{ padding: '13px 18px', background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 34, height: 34, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChatIcon size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2, color: 'var(--gb-text-primary)' }}>Live chat — matte finish inquiry</span><Tag size="xs" tone="neutral">READ-ONLY</Tag></div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>SnapEngage · Case #C-4471</div>
          </div>
        </div>
        <div className="gb-thin-scroll" style={{ maxHeight: 320, overflowY: 'auto', padding: '16px 20px', background: 'var(--gb-surface-canvas)' }}>
          {CHAT.map((m, i) => <ChatBubble key={i} msg={m} prev={CHAT[i - 1]} />)}
        </div>
        <div style={{ padding: '9px 18px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--gb-text-muted)' }}>
          <Tag size="xs" tone="neutral">VIEW ONLY</Tag>
          <span>{visibleCount} parsed messages · replies happen in SnapEngage</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5 }}>C-4471</span>
        </div>
      </MiniFrame>
    );
  }

  /* ===================== PAGE: Email / Chat Viewer ===================== */
  function EmailChatPage() {
    return (
      <div className="prose">
        <div className="eyebrow">On-page Helpers</div>
        <h1 className="title">Email &amp; Chat Viewer</h1>
        <p className="lede">Read a customer conversation in a clean, dark, on-brand panel — without fighting the CRM's cramped native view. The extension parses the raw email or SnapEngage chat and renders it as a proper thread, with a one-click <strong>Case mode</strong> that adds a categorize rail for triaging support cases.</p>

        <TourBox stack title="Email thread viewer" live={<EmailViewerSnippet />} eyebrow="any email row · message preview">
          <p>Opening an email renders the full <strong>thread</strong> — one card per message, oldest to newest, color-coded so <strong>your</strong> replies (US) stand apart from the <strong>customer's</strong> (CUSTOMER). Each card expands/collapses; the avatar and name come from the parsed headers.</p>
          <p>Flip the header toggle to <strong>Case</strong> and a <strong>Categorize rail</strong> slides in on the right — pick a category and reason to triage the case, with a ✦ <strong>Recommended</strong> shortcut suggested from the matched template. In Inbox mode you instead get a <strong>Reply</strong> button that opens the rich composer. Try the Inbox/Case toggle above.</p>
        </TourBox>

        <TourBox stack title="Chat transcript viewer" live={<ChatViewerSnippet />} eyebrow="SnapEngage live-chat cases">
          <p>Chat cases render as a <strong>read-only transcript</strong>: visitor bubbles on the left, agent on the right, with <strong>system</strong> events (chat started), <strong>notes</strong> (internal, amber), and a <strong>link</strong> back to the full SnapEngage record inline. Consecutive messages from the same person group together, just like a messaging app.</p>
          <p>It's deliberately <strong>view-only</strong> — replies still happen in SnapEngage — but in Case mode it shows the same Categorize rail as email, so a chat can be triaged without leaving the page.</p>
        </TourBox>

        <h2 className="sec">What the two share</h2>
        <table className="spectable">
          <thead><tr><th>Feature</th><th>Email</th><th>Chat</th></tr></thead>
          <tbody>
            <tr><td><b>Threaded rendering</b></td><td>Quoted history split into cards</td><td>Grouped chat bubbles</td></tr>
            <tr><td><b>Case mode + Categorize rail</b></td><td>Yes</td><td>Yes</td></tr>
            <tr><td><b>✦ Recommended category</b></td><td>From matched template</td><td>From matched template</td></tr>
            <tr><td><b>Reply</b></td><td>Rich composer (Inbox mode)</td><td>View-only → SnapEngage</td></tr>
          </tbody>
        </table>
        <div className="docnote info">
          <span className="dn-ico">{I.mail({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Why a separate viewer at all?</div><p style={{ margin: 0 }}>The CRM's built-in message view is plain-text and hard to scan. This viewer normalizes the HTML (dark-mode safe), rebuilds the real thread order, resolves <code>Name &lt;email&gt;</code> for every quoted message, and keeps the reply + categorize actions one click away.</p></div>
        </div>
      </div>
    );
  }

  window.GBPages['viewer-email'] = { title: 'Email / Chat Viewer', group: 'On-page Helpers', icon: 'mail', render: () => <EmailChatPage /> };

  /* image + 3D pages are registered by page-viewers-2.jsx */
  window.GBViewerShared = { Avatar, ViewToggle, MiniFrame, TourBox };
})();
