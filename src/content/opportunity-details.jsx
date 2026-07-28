/* eslint-disable */
/**
 * Opportunity-details custom page (CRM Page 280).
 *
 * Owns opportunity-specific data (Opportunity/Get scalars, proposal
 * extraction + email generation). All layout and cross-page panels come from
 * the shared detail modules; the page composes DetailPageFrame.
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ProposalEmailComposer } from '../modals/ProposalEmail.jsx';
import { buildEmailSourceFromCartIds } from '../lib/proposalEmailSource.js';
import { MarginBreakdown } from '../ui/components/MarginBreakdown.jsx';
import { Btn, Card, ContactPill, DASH, DataCtx, DetailErrorBoundary, Dot, EmailsPanel, I, KV, LazySection, ScrollArea, SectionTitle, Spinner, StatCardGrid, Tag, Td, Th, fmt$, fullName, goUrl, tableStyle, trStyle, txt, useD } from '../lib/detail-shared.jsx';
import { BackChip, Breadcrumb, DetailPageFrame, HeroShell, ModalCtx, OPP_STAGES, OpportunityModal, PatchCtx, TasksPanel, TopBar, crmGetOpportunity, gbToast, hostInputValue, hostSelectLabel, useDetailData, useModal, useModalHost } from '../lib/crm-detail-shared.jsx';

/* Proposals live in the host DOM as checkboxes whose ONCHANGE is
   ProposalCheckToggle(this, '<cartId>', '<name>', '<expiration>', '<newSite>'). */
function extractProposals(doc) {
  const out = [];
  try {
    (doc || document).querySelectorAll('[onchange*="ProposalCheckToggle"], [onclick*="ProposalCheckToggle"]').forEach((el) => {
      const oc = el.getAttribute('onchange') || el.getAttribute('onclick') || '';
      const m = /ProposalCheckToggle\(\s*this\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*([^)]*)\)/.exec(oc);
      if (m) out.push({ cartId: m[1], name: (m[2] || '').replace(/\\'/g, "'").trim(), expiration: m[3], newSite: /true/i.test(m[4]) });
    });
  } catch (e) {}
  return out;
}

/* ════════════════════════════════════════════════════════════
   OPPORTUNITY — header / stats / info (scalars fetched via
   Opportunity/Get; tasks/emails come from the shared schema).
════════════════════════════════════════════════════════════ */
const OppCtx = React.createContext({ opp: null });
const useOpp = () => React.useContext(OppCtx);
const OPP_SOURCES = [
  { value: 0, label: 'Not Set' }, { value: 1, label: 'Scramble Hunter' }, { value: 2, label: 'Play Yellow' },
  { value: 3, label: 'Perfect Golf Events' }, { value: 4, label: 'Green Grass' }, { value: 5, label: 'Ryan LeMaire' },
  { value: 6, label: 'Graeme Fidelak' }, { value: 7, label: 'Meta' },
];
function oppIdFromUrl() {
  try { const p = new URLSearchParams(location.search); return p.get('opportunityID') || p.get('opportunityId') || ''; } catch (e) { return ''; }
}
function adaptOpp(g, id) {
  if (!g) return null;
  const stage = (OPP_STAGES.find((s) => String(s.value) === String(g.OpportunityStageId)) || {}).label || g.Status || '';
  const source = (OPP_SOURCES.find((s) => String(s.value) === String(g.sourceID)) || {}).label || '';
  // MetaData is a JSON blob carrying CreatedBy + the proposal list.
  let meta = {};
  try { meta = g.MetaData ? (typeof g.MetaData === 'string' ? JSON.parse(g.MetaData) : g.MetaData) : {}; } catch (e) { meta = {}; }
  const createdById = String(g.empCreatedId ?? meta.CreatedBy ?? '');
  const assignedById = String(g.empAssignedId ?? '0');
  return {
    id: String(id || g.opportunityId || ''),
    subject: g.Subject || '', stage, stageId: g.OpportunityStageId, source, sourceId: g.sourceID,
    estimatedValue: Number(g.EstimatedValue) || 0,
    estimatedClosedDate: g.EstimatedClosedDate || '',
    // Get returns probability as a 0–1 fraction ("0.75"); the CRM displays it
    // as a whole percent (75). Normalize to percent for display.
    closedProbability: (function (v) {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!isFinite(n)) return null;
      return Math.round(n <= 1 ? n * 100 : n);
    })(g.ClosedProbability),
    description: g.Description || '',
    // audit / assignment fields the native page shows but we never surfaced
    createdById,
    assignedById,
    createdBy: hostSelectLabel('empCreatedId', createdById, createdById ? '#' + createdById : ''),
    assignedTo: hostSelectLabel('empAssignedId', assignedById, 'Account Owner'),
    actualValue: Number(g.ActualValue) || 0,
    actualClosedDate: g.ActualCloseDate || '',
    lastModified: hostInputValue('LastModifiedDate', ''),
    proposalCount: Array.isArray(meta.Proposals) ? meta.Proposals.length : 0,
  };
}
function oppStageTone(stage) {
  const s = (stage || '').toLowerCase();
  if (s.indexOf('won') !== -1 || s === 'ordered') return 'success';
  if (s.indexOf('lost') !== -1) return 'error';
  if (s === 'proposed') return 'brand';
  if (s === 'qualified' || s === 'open') return 'info';
  return 'warning';
}
function OppHeader() {
  const { opp } = useOpp();
  const D = useD();
  const { openModal } = useModal();
  const tone = oppStageTone(opp.stage);
  const cname = [D.contact.firstName, D.contact.lastName].filter(Boolean).join(' ');
  return (
    <HeroShell minActionsWidth={210} actions={<>
      <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<OpportunityModal opportunityId={opp.id} />)}>Edit Opportunity</Btn>
      <Btn variant="tinted" status="warning" icon={<I.cart />} full onClick={() => goUrl(`https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}`)}>Proposal Mode</Btn>
      <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
    </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.target size={19} /></span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -.4, color: 'var(--gb-text-primary)' }}>{opp.subject || 'Opportunity'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <Tag tone={tone} size="md" icon={<Dot tone={tone} glow />}>{opp.stage || '—'}</Tag>
            <Tag tone="neutral" size="md">Opportunity #{opp.id}</Tag>
            {opp.createdBy && <Tag tone="neutral" size="md" icon={<I.user />}>Created by {opp.createdBy}</Tag>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px dashed var(--gb-border-subtle)' }}>
        <ContactPill icon={<I.briefcase />} label="Account" value={txt(D.account.name)} />
        <ContactPill icon={<I.user />} label="Contact" value={cname || DASH} />
        <ContactPill icon={<I.user />} label="Assigned To" value={opp.assignedTo || 'Account Owner'} muted={!opp.assignedTo || opp.assignedTo === 'Account Owner'} />
        <ContactPill icon={<I.phone />} label="Phone" value={txt(D.contact.phone)} />
        <ContactPill icon={<I.mail />} label="Email" value={txt(D.contact.email)} />
      </div>
    </HeroShell>
  );
}
function OppStatsStrip() {
  const { opp } = useOpp();
  const D = useD();
  return <StatCardGrid cells={[
    { label: 'Estimated Value', value: fmt$(opp.estimatedValue), sub: `${opp.closedProbability != null ? opp.closedProbability : 0}% close prob.`, tone: 'brand', glow: true },
    { label: 'Stage', value: opp.stage || '—', sub: opp.source || 'Not Set', tone: oppStageTone(opp.stage) },
    { label: 'Open Tasks', value: D.openTasks.length, sub: 'follow-ups', tone: D.openTasks.length ? 'warning' : 'success' },
    { label: 'Emails', value: D.emails.length, sub: 'in thread', mono: true },
    { label: 'Est. Close', value: opp.estimatedClosedDate || DASH, sub: 'target', mono: true },
    { label: 'Source', value: opp.source || 'Not Set', sub: 'origin' },
  ]} />;
}
function OppInfoCard() {
  const { opp } = useOpp();
  const D = useD();
  const { openModal } = useModal();
  return (
    <Card>
      <SectionTitle icon={<I.target />} title="Opportunity Information" sub={`#${opp.id} · ${txt(D.account.name)}`}
        right={<Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => openModal(<OpportunityModal opportunityId={opp.id} />)}>Edit Opportunity</Btn>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px', padding: '8px 18px 16px' }}>
        <div>
          <KV label="Subject">{txt(opp.subject)}</KV>
          <KV label="Status"><Tag tone={oppStageTone(opp.stage)} size="sm">{opp.stage || '—'}</Tag></KV>
          <KV label="Source">{opp.source || 'Not Set'}</KV>
          <KV label="Estimated Value" mono>{fmt$(opp.estimatedValue)}</KV>
          <KV label="Est. Closed Date" mono>{opp.estimatedClosedDate || DASH}</KV>
          <KV label="Closed Probability" mono>{opp.closedProbability != null ? opp.closedProbability + '%' : DASH}</KV>
          {opp.actualValue > 0 && <KV label="Actual Value" mono>{fmt$(opp.actualValue)}</KV>}
          {opp.actualClosedDate && <KV label="Actual Close Date" mono>{opp.actualClosedDate}</KV>}
        </div>
        <div>
          <KV label="Created By">{opp.createdBy || DASH}</KV>
          <KV label="Assigned To">{opp.assignedTo || DASH}</KV>
          <KV label="Last Modified" mono>{opp.lastModified || DASH}</KV>
          <KV label="Opportunity ID" mono copyable>{opp.id}</KV>
          <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
          <KV label="Contact ID" mono copyable>{txt(D.ids.contact)}</KV>
        </div>
        <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500, marginBottom: 5 }}>Description</div>
          <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>{opp.description || DASH}</div>
        </div>
      </div>
    </Card>
  );
}

/* Proposals + inline email generation (your modal, inlined): select proposals
   full-width, then the breakdown + generated email full-width below. */
function ProposalsSection() {
  const { opp } = useOpp();
  const D = useD();
  const [proposals, setProposals] = useState(() => extractProposals(document));
  useEffect(() => {
    if (proposals.length) return undefined;   // retry briefly if rows render late
    let n = 0;
    const t = setInterval(() => { const p = extractProposals(document); if (p.length) { setProposals(p); clearInterval(t); } else if (++n > 8) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, []);
  const [selected, setSelected] = useState([]);
  const [source, setSource] = useState(null);
  const [building, setBuilding] = useState(false);
  const toggle = (id) => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); setSource(null); };
  const chosen = proposals.filter((p) => selected.includes(p.cartId));
  // Resolved lines for the margin report: single source carries rawLines; a
  // multi-proposal source carries them per section.
  const marginEntries = source ? ((source.rawLines && source.rawLines.length) ? source.rawLines : (source.sections || []).flatMap((s) => s.rawLines || [])) : [];
  const hasContent = !!(source && ((source.lines && source.lines.length) || (source.sections && source.sections.length)));
  const buildEmail = async () => {
    if (!chosen.length || building) return;
    setBuilding(true);
    try {
      // Reuse the modal's proven pipeline: loadProposalCart → cartToEntry →
      // linesFromSaved → proposalToEmailSource (single) / sections (multi).
      const src = await buildEmailSourceFromCartIds(chosen.map((p) => p.cartId), { name: chosen.length === 1 ? chosen[0].name : '' });
      setSource(src);
    } catch (e) { gbToast('Could not load proposal carts', 'error'); }
    finally { setBuilding(false); }
  };
  return (
    <>
      <Card>
        <SectionTitle icon={<I.cart />} title="Proposals" count={proposals.length} sub="Select proposals to build a customer email"
          right={<Btn variant="tinted" status="warning" size="sm" icon={<I.cart />} onClick={() => goUrl(`https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}`)}>Proposal Mode</Btn>} />
        {proposals.length === 0
          ? <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No proposals on this opportunity yet — use Proposal Mode to build one.</div>
          : (
            <ScrollArea max={300}>
              <table style={tableStyle}>
                <thead><tr><Th style={{ width: 34 }}></Th><Th>Name</Th><Th>Cart</Th><Th align="right">Expires</Th><Th align="center">Site</Th></tr></thead>
                <tbody>
                  {proposals.map((p) => {
                    const on = selected.includes(p.cartId);
                    return (
                      <tr key={p.cartId} style={{ ...trStyle, background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', cursor: 'pointer', transition: 'background var(--gb-anim)' }} onClick={() => toggle(p.cartId)}>
                        <Td><span style={{ width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--gb-brand-label)' : 'transparent', border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), color: 'var(--gb-surface-deep)' }}>{on && <I.check size={10} />}</span></Td>
                        <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 600 }}>{p.name}</span></Td>
                        <Td>
                          {(() => { const url = `https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}&cartID=${p.cartId}`; return (
                            <a href={url} title={url} onClick={(e) => { e.stopPropagation(); e.preventDefault(); goUrl(url); }}
                              style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-brand-label)', textDecoration: 'none', wordBreak: 'break-all', lineHeight: 1.4 }}>{url}</a>
                          ); })()}
                        </Td>
                        <Td align="right" mono><span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{p.expiration}</span></Td>
                        <Td align="center">{p.newSite ? <Tag tone="info" size="xs">New</Tag> : <Tag tone="neutral" size="xs">Legacy</Tag>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
      </Card>
      <Card>
        <SectionTitle icon={<I.bolt />} title="Build Proposal Breakdown" sub="Loads each selected proposal's cart → margin + customer email"
          right={<Btn variant="primary" size="sm" disabled={!chosen.length || building} onClick={buildEmail}
            icon={building ? <span style={{ width: 13, height: 13, borderRadius: '50%', borderStyle: 'solid', borderWidth: 2, borderColor: 'currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'gb-spin 0.7s linear infinite' }} /> : <I.bolt />}>
            {building ? 'Loading…' : hasContent ? 'Rebuild' : 'Build'}</Btn>} />
        <div style={{ padding: 16 }}>
          {building ? (
            <Spinner size={28} pad="34px 0" label={`Loading proposal cart${chosen.length > 1 ? 's' : ''} & building breakdown…`} />
          ) : !source ? (chosen.length === 0
            ? <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-faint)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>Select one or more proposals above, then Build.</div>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{chosen.map((p) => <Tag key={p.cartId} tone="brand" size="sm">{p.name}</Tag>)}</div>
          ) : hasContent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--gb-success-fg)' }}>
              <I.check size={14} /> Built — margin breakdown and email below.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--gb-text-secondary)', lineHeight: 1.55 }}>
              Loaded the cart(s) but no line items came back for{' '}
              <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{chosen.map((p) => p.cartId).join(', ')}</span>. The carts may be empty or failed to load.
            </div>
          )}
        </div>
      </Card>

      {hasContent && marginEntries.length > 0 && (
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <SectionTitle icon={<I.spark />} title="Margin Breakdown" sub="Blended margin across the selected proposal(s)" />
          <div style={{ padding: 16 }}>
            <MarginBreakdown entries={marginEntries} />
          </div>
        </Card>
      )}

      {hasContent && (
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <SectionTitle icon={<I.mail />} title="Proposal Email" sub="Generated from the proposals' line items — pick a template & preview" />
          <div style={{ height: 'min(720px, 78vh)', display: 'flex', flexDirection: 'column' }}>
            <ProposalEmailComposer source={source} />
          </div>
        </Card>
      )}
    </>
  );
}

function App({ store }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();
  // Opportunity scalars come from Opportunity/Get (more reliable than scraping);
  // tasks/emails/contact come from the shared schema (D).
  const [opp, setOpp] = useState(null);
  useEffect(() => {
    const id = oppIdFromUrl();
    if (!id) return undefined;
    let live = true;
    crmGetOpportunity(id).then((g) => { if (live) setOpp(adaptOpp(g, id)); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const contactId = D.ids.contact;
  const contactName = fullName(D.contact);
  const contactHref = contactId ? `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}` : null;
  const oid = (opp && opp.id) || oppIdFromUrl();

  return (
    <DataCtx.Provider value={D}>
    <OppCtx.Provider value={{ opp, setOpp }}>
    <PatchCtx.Provider value={patch}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentLabel={'Opportunity · #' + oppIdFromUrl()}
        ready={D.ready}
        modalHost={modalHost}
        topBar={
          <TopBar>
            {/* Back-to-contact tag — the opportunity belongs to this contact */}
            <BackChip href={contactHref} label={contactName ? `Back to ${contactName}` : 'Back to contact'} title="Back to contact" />
            <Breadcrumb items={[{ label: 'CRM', page: 261 }, { label: 'Opportunity', page: 280 }]}
              current={txt(D.account.name) || (opp && opp.subject) || 'Opportunity'} id={oid} />
          </TopBar>
        }>
        {!opp ? (
          <Spinner label="Loading opportunity…" />
        ) : (
          <>
            <OppHeader />
            <OppStatsStrip />
            <OppInfoCard />
            <ProposalsSection />
            <LazySection minHeight={700}><TasksPanel /></LazySection>
            <LazySection><EmailsPanel /></LazySection>
          </>
        )}
      </DetailPageFrame>
    </ModalCtx.Provider>
    </PatchCtx.Provider>
    </OppCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbOpportunityDetailsRegistered) {
  window.__gbOpportunityDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.opportunity_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Opportunity page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
