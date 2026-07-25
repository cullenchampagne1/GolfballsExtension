import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, IconBtn, Tag, Dot, Input, ModalShell, I } from '../ui/index.js';
import { CodeAutomationPanel } from '../ui/components/CodeAutomationPanel.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  loadCampaigns, saveCampaign, removeCampaign, newCampaign, subscribeCampaigns,
} from '../lib/campaign/store.js';
import { parseCampaignBlob, importCampaigns } from '../lib/campaign/campaignImport.js';
import { useDevSettings } from '../lib/devSettings.js';
import {
  CAMPAIGN_MANAGER_HEIGHT,
  CAMPAIGN_MANAGER_WIDTH,
  fitCampaignManagerScale,
  normalizeCampaignManagerScale,
} from '../lib/campaign/presentation.js';

/* ───────────────────────────────────────────────────────────────
   CampaignManager — code-first campaign editor.

   One authoring surface: a library sidebar + the CodeAutomationPanel,
   where a campaign is plain JS written against `page.*` (the audience
   model) and `actions.*` (the callable action library), projected live
   into blocks and runnable as a no-side-effect Simulate. Campaigns
   persist via lib/campaign/store.js (`automation` = the code source).
   The manual step timeline was retired in favor of pure code.
─────────────────────────────────────────────────────────────── */

const CMP_STYLE_ID = '__gb-campaign-mgr-css';
function ensureCampaignStyles() {
  if (typeof document === 'undefined' || document.getElementById(CMP_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = CMP_STYLE_ID;
  // Hover-reveal the per-row delete button in the library sidebar.
  s.textContent = `
    .gb-cmp-row .gb-cmp-del { opacity: 0; transition: opacity .12s ease; }
    .gb-cmp-row:hover .gb-cmp-del { opacity: 1; }
  `;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Sidebar ── */
function CampaignSidebar({ library, currentId, onSelect, onNew, onDelete, onImport }) {
  const [q, setQ] = useState('');
  const [confirmId, setConfirmId] = useState(null);   // row pending delete-confirm
  const filtered = library.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [
    { key: 'Active', rows: filtered.filter((c) => c.status === 'Active') },
    { key: 'Drafts', rows: filtered.filter((c) => c.status === 'Draft') },
    { key: 'Paused', rows: filtered.filter((c) => c.status === 'Paused') },
  ].filter((g) => g.rows.length);
  return (
    <div style={{ width: 264, flexShrink: 0, background: 'var(--gb-surface-1)', borderRight: '1px solid var(--gb-border-default)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={14} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaigns</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{library.length} total</div>
        </div>
        <IconBtn size="sm" variant="ghost" icon={<I.download />} title="Import campaign (paste AI JSON)" onClick={onImport} />
        <IconBtn size="sm" variant="secondary" icon={<I.plus />} onClick={onNew} />
      </div>
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <Input value={q} placeholder="Search campaigns…" leading={<I.search size={13} />} onChange={(v) => setQ(v)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {groups.length === 0 && <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>No campaigns yet.</div>}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-text-muted)' }}>
              <span>{g.key}</span><span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /><span style={{ fontFamily: 'var(--gb-font-mono)' }}>{g.rows.length}</span>
            </div>
            {g.rows.map((row) => {
              const cur = row.id === currentId;
              const confirming = confirmId === row.id;
              return (
                <div key={row.id} className="gb-cmp-row" onClick={() => onSelect(row.id)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 9, alignItems: 'center', padding: '8px 10px', background: cur ? 'var(--gb-brand-tint-soft)' : 'transparent', border: '1px solid ' + (cur ? 'var(--gb-brand-tint-border)' : 'transparent'), borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', marginBottom: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Dot tone={row.status === 'Active' ? 'brand' : row.status === 'Paused' ? 'warning' : 'muted'} glow={row.status === 'Active'} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: cur ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{(row.automation || '').trim() ? 'code' : 'empty'}</div>
                  </div>
                  {/* Delete: a hover-revealed trash that turns into an inline
                      confirm (no native dialog, stays in-modal). */}
                  {confirming ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <IconBtn size="xs" danger icon={<I.check />} title="Confirm delete" onClick={() => { setConfirmId(null); onDelete?.(row.id); }} />
                      <IconBtn size="xs" variant="ghost" icon={<I.close />} title="Cancel" onClick={() => setConfirmId(null)} />
                    </div>
                  ) : (
                    <IconBtn className="gb-cmp-del" size="xs" variant="ghost" icon={<I.trash />} title="Delete campaign"
                      onClick={(e) => { e.stopPropagation(); setConfirmId(row.id); }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top bar ── */
/* Compact money for the audience-value chip ($12.3k / $1.2M). */
function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

function TopBar({ campaign, onChange, dirty, audienceCount, audienceValue, onSave, onClose }) {
  return (
    <div style={{ padding: '12px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={17} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaign Manager</div>
          {/* Plain transparent field — flush-left under the label, no box, grows to fill the bar. */}
          <input value={campaign.name} onChange={(e) => onChange({ ...campaign, name: e.target.value })}
            style={{ marginTop: 2, width: '100%', height: 24, background: 'transparent', border: 'none', outline: 'none', padding: 0, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 16, fontWeight: 800, letterSpacing: -.3 }} />
        </div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 7px', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.users size={12} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Audience</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)' }}>{audienceCount}</span>
        </div>
        {/* Total audience value — summed handed-off revenue. Hidden when the
            selection carried no value (e.g. a Task List launch ⇒ $0). */}
        {audienceValue > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--gb-border-default)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Value</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-success-fg)', fontFamily: 'var(--gb-font-mono)' }}>{fmtMoney(audienceValue)}</span>
            </div>
          </>
        )}
      </div>
      <Btn variant="primary" status="brand" size="sm" icon={<I.check />} onClick={onSave} disabled={!dirty}>{dirty ? 'Save' : 'Saved'}</Btn>
      <div style={{ width: 1, height: 26, background: 'var(--gb-border-default)' }} />
      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

/* ── Import campaigns — paste an AI-generated JSON blob ──────────
   Shape contract lives in docs/llm-campaign-toolset.md (the toolset file
   handed to a model so it can author full campaigns). Validates live as
   you paste; Import appends with fresh ids (never overwrites) and
   resolves saved-template references by name. */
function ImportCampaignsModal({ onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    try { return { ok: true, items: parseCampaignBlob(t) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, [text]);
  const doImport = async () => {
    if (!parsed || !parsed.ok || busy) return;
    setBusy(true);
    try { onDone(await importCampaigns(parsed.items)); }
    catch (e) { onDone({ error: e.message }); }
  };
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 600, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.download size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Import campaign</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Paste an AI-generated JSON blob — single campaign, array, or {'{ campaigns: […] }'} · spec in docs/llm-campaign-toolset.md</div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Paste the campaign JSON here…'
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', height: 240, resize: 'vertical', padding: 10,
              background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
              outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 11, lineHeight: 1.5 }}
          />
          {parsed && (
            parsed.ok ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-success-fg)' }}>
                  {parsed.items.length} campaign{parsed.items.length === 1 ? '' : 's'} ready to import
                </div>
                {parsed.items.map(({ campaign: c, warnings }, i) => {
                  const branches = c.steps.filter((s) => s.branch).length;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--gb-text-secondary)', minWidth: 0 }}>
                        <Tag tone="brand" size="xs">{c.steps.length} step{c.steps.length === 1 ? '' : 's'}</Tag>
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        <span style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }}>{branches ? `${branches} branch${branches === 1 ? '' : 'es'} · ` : ''}{c.audienceOrder}</span>
                      </div>
                      {warnings.map((w, j) => (
                        <div key={j} style={{ fontSize: 10, color: 'var(--gb-warning-fg)', paddingLeft: 4 }}>⚠ {w}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '9px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-error-tint-soft, var(--gb-warning-tint-soft))', border: '1px solid var(--gb-error-tint-border, var(--gb-warning-tint-border))', fontSize: 11, color: 'var(--gb-error-fg, var(--gb-warning-fg))', lineHeight: 1.5 }}>
                {parsed.error}
              </div>
            )
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '11px 14px', borderTop: '1px solid var(--gb-border-subtle)' }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" icon={<I.download />} disabled={!parsed || !parsed.ok || busy} state={busy ? 'loading' : 'idle'} onClick={doImport}>
            Import{parsed && parsed.ok ? ` ${parsed.items.length}` : ''}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Root ── */
export function CampaignManager({ onClose, contacts = [] }) {
  ensureCampaignStyles();
  const toast = useToast();
  // Modal zoom is a dev setting (mirrors the Gifting Catalog), live-updating
  // from Settings without a reload. The final scale also fits the full editor
  // into the current CSS viewport, which compensates for per-site browser zoom.
  const [devSettings] = useDevSettings();
  const preferredScale = normalizeCampaignManagerScale(devSettings['campaignManager.scale']);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    const read = () => setViewport({
      width: window.visualViewport?.width || window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
    });
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
    };
  }, []);
  const scale = fitCampaignManagerScale(preferredScale, viewport.width, viewport.height);
  // Drive an exit animation: requestClose flips `open` false, the
  // AnimatePresence plays the fade/scale-out, then onExitComplete unmounts.
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const [library, setLibrary] = useState([]);
  const [campaign, setCampaign] = useState(() => newCampaign('Untitled campaign'));
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Import result from the paste dialog: refresh the library, open the first
  // imported campaign, and surface anything the importer couldn't resolve.
  const onImported = (r) => {
    setImportOpen(false);
    if (!r || r.error) { toast?.error?.('Import failed — ' + (r?.error || 'unknown')); return; }
    setLibrary(r.list);
    const first = r.list[0];
    if (first) { setCampaign(first); setDirty(false); }
    if (r.unresolved?.length) {
      toast?.warning?.(`Imported ${r.count} — ${r.unresolved.length} template${r.unresolved.length === 1 ? '' : 's'} need picking in the editor`, { duration: 5000 });
    } else {
      toast?.success?.(`Imported ${r.count} campaign${r.count === 1 ? '' : 's'}`);
    }
  };

  // Load campaigns once + stay subscribed to store changes.
  useEffect(() => {
    let alive = true;
    loadCampaigns().then((list) => {
      if (!alive) return;
      setLibrary(list);
      if (list.length) setCampaign(list[0]);
    });
    const unsub = subscribeCampaigns((list) => { if (alive) setLibrary(list); });
    return () => { alive = false; unsub(); };
  }, []);

  const patchCampaign = (next) => { setCampaign(next); setDirty(true); };

  const selectCampaign = (id) => {
    const c = library.find((x) => x.id === id);
    if (c) { setCampaign(c); setDirty(false); }
  };
  const createCampaign = () => {
    setCampaign(newCampaign('Untitled campaign')); setDirty(true);
  };
  const deleteCampaign = (id) => {
    const removed = library.find((c) => c.id === id);
    removeCampaign(id).then((list) => {
      setLibrary(list);
      // If we deleted the open campaign, fall back to the first remaining
      // one (or a fresh untitled draft if the library is now empty).
      if (campaign.id === id) {
        setCampaign(list[0] || newCampaign('Untitled campaign')); setDirty(!list.length);
      }
      toast?.success?.(`Deleted “${removed?.name || 'campaign'}”`);
    }).catch(() => toast?.error?.('Couldn’t delete campaign'));
  };
  const save = () => {
    saveCampaign(campaign).then(({ campaign: saved, list }) => {
      setLibrary(list); setCampaign(saved); setDirty(false);
      toast?.success?.(`Saved “${saved.name}”`);
    }).catch(() => toast?.error?.('Couldn’t save campaign'));
  };

  // The read-only `page` model the code panel simulates against — the live
  // audience selection, so `page.contacts` / `page.contact` resolve for real.
  const audienceKeyed = useMemo(() => contacts.map((c, i) => ({ ...c, _key: c.contactId || c.contactUrl || `row${i}` })), [contacts]);
  const simPage = useMemo(() => ({
    contacts: audienceKeyed,
    contact: audienceKeyed[0] || {},
    count: audienceKeyed.length,
  }), [audienceKeyed]);
  const setAutomation = (src) => patchCampaign({ ...campaign, automation: src });
  const audienceValue = useMemo(() => contacts.reduce((s, c) => s + (Number(c.value) || 0), 0), [contacts]);

  return (
    <AnimatePresence onExitComplete={onClose}>
    {open && (
    <motion.div key="cm-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', zIndex: 'var(--gb-z-max)' }}>
      {/* The shared ModalShell (non-draggable card) keeps chrome + the
          bounce-in consistent with every other modal. Fixed-pixel size (not
          vw/vh) lets this surface own one deterministic zoom value; its mount
          root deliberately opts out of the shared Modals scale. The wrapper
          (initial=false ⇒ no entrance, ModalShell owns the bounce-in) plays
          the scale/fade exit on close. */}
      <motion.div initial={false} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }} style={{ display: 'flex' }}>
      <ModalShell width={CAMPAIGN_MANAGER_WIDTH} height={CAMPAIGN_MANAGER_HEIGHT} style={{ zoom: scale, color: 'var(--gb-text-secondary)' }}>
        <TopBar campaign={campaign} onChange={patchCampaign}
          dirty={dirty} audienceCount={contacts.length} audienceValue={audienceValue}
          onSave={save} onClose={requestClose} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CampaignSidebar library={library} currentId={campaign.id} onSelect={selectCampaign} onNew={createCampaign} onDelete={deleteCampaign} onImport={() => setImportOpen(true)} />
          <CodeAutomationPanel value={campaign.automation || ''} onChange={setAutomation} page={simPage} />
        </div>
      </ModalShell>
      </motion.div>
      {importOpen && <ImportCampaignsModal onClose={() => setImportOpen(false)} onDone={onImported} />}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default CampaignManager;
