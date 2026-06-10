/* ───────────────────────────────────────────────────────────────
   popup-live.jsx — a faithful, runnable port of src/popup/popup.jsx.
   Same layout, tokens, and behavior, but reads from an injected mock
   `chrome` and exposes an imperative handle so the walkthrough engine
   can drive it. Renders <PopupLive chrome={mock} apiRef={ref} />.
   Exposed as window.PopupLive.
─────────────────────────────────────────────────────────────── */
(function () {
  const { motion, AnimatePresence } = window.Motion;
  const { useState, useEffect, useMemo, useImperativeHandle, forwardRef } = React;
  const G = window.GB;
  const { Btn, TemplatePicker, KeyVal, SectionLabel, Tag, Dot, Spinner, I, T } = G;

  const WL_BTN = { order: 'Watch Order', contact: 'Watch Contact', account: 'Watch Account' };

  const Ic = {
    watch: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    checkbox: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
    paperclip: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
    reply: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>,
  };

  function Header({ onManage, templateCount }) {
    return (
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div data-demo="logo" style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.mail size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.1 }}>Email Templates</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>Golfballs.com</span>
            <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />
            <span>{templateCount} template{templateCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div data-demo="manage"><Btn size="sm" icon={<I.cog />} onClick={onManage}>Manage</Btn></div>
      </div>
    );
  }

  function Shell({ children, onManage, templateCount, minHeight = 340 }) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.34, 1.4, 0.64, 1] }}
        style={{ width: 320, minHeight, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', borderRight: '1px solid var(--gb-border-subtle)', borderBottom: '1px solid var(--gb-border-subtle)', overflow: 'hidden', position: 'relative', boxSizing: 'border-box', transformOrigin: 'top center' }}>
        <Header onManage={onManage} templateCount={templateCount} />
        <div style={{ flex: 1, padding: '14px 14px', overflow: 'visible', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </motion.div>
    );
  }

  function Reveal({ children, gap = 6 }) {
    return <motion.div initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: 'auto', opacity: 1, marginTop: gap }} exit={{ height: 0, opacity: 0, marginTop: 0 }} transition={T.base} style={{ overflow: 'visible' }}>{children}</motion.div>;
  }

  function LoadingVal({ code }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: code ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}><Spinner size={9} />{code ? 'running code…' : 'resolving…'}</span>;
  }

  const PopupLive = forwardRef(function PopupLive({ chrome, onToast }, ref) {
    const [tab, setTab] = useState(null);
    const [allTemplates, setAllTemplates] = useState([]);
    const [pageInfo, setPageInfo] = useState({});
    const [flags, setFlags] = useState({});
    const [watchList, setWatchList] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedVariationId, setSelectedVariationId] = useState(null);
    const [matchedIds, setMatchedIds] = useState([]);
    const [resolvingIds, setResolvingIds] = useState([]);
    const [resolvedVars, setResolvedVars] = useState({});
    const [resolvedTo, setResolvedTo] = useState('');
    const [resolving, setResolving] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const storageGet = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
    const tabsQueryActive = () => new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t[0] || null)));
    const sendMessage = (tabId, msg) => new Promise((res) => chrome.tabs.sendMessage(tabId, msg, res));

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const currentTab = await tabsQueryActive();
        if (cancelled || !currentTab) return;
        const data = await storageGet(['templates', 'watchList', 'featureFlags']);
        const tpls = (data.templates || []).filter((t) => t.enabled !== false && t.type !== 'case');
        const mergedFlags = { chargeEnabled: true, orderEditEnabled: true, submitProofEnabled: true, taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true, ...(data.featureFlags || {}) };
        setTab(currentTab); setAllTemplates(tpls); setWatchList(data.watchList || []); setFlags(mergedFlags);
        const info = await sendMessage(currentTab.id, { action: 'getPageInfo', templates: tpls });
        if (cancelled) return;
        setPageInfo(info || {});
        setMatchedIds(info.matchedTemplateIds || []);
        setResolvingIds(info.pendingTemplateIds || []);
        const pageType = info.pageType || 'other';
        const visible = pageType === 'order' ? tpls.filter((t) => t.type === 'order' || t.type === 'email' || !t.type) : (pageType === 'account' || pageType === 'contact') ? tpls.filter((t) => t.type === 'account') : tpls;
        const matched = info.matchedTemplateIds || [];
        setSelectedId(matched.find((id) => visible.some((t) => t.id === id)) || visible[0]?.id || null);
      })();
      return () => { cancelled = true; };
    }, []);

    // live storage sync (flags toggled from elsewhere)
    useEffect(() => {
      const listener = (changes, area) => {
        if (area !== 'local') return;
        if (changes.featureFlags) setFlags({ chargeEnabled: true, orderEditEnabled: true, submitProofEnabled: true, taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true, ...(changes.featureFlags.newValue || {}) });
        if (changes.watchList) setWatchList(changes.watchList.newValue || []);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    const visibleTemplates = useMemo(() => {
      const pageType = pageInfo.pageType || 'other';
      if (pageType === 'order') return allTemplates.filter((t) => t.type === 'order' || t.type === 'email' || !t.type);
      if (pageType === 'account' || pageType === 'contact') return allTemplates.filter((t) => t.type === 'account');
      return allTemplates;
    }, [allTemplates, pageInfo.pageType]);

    const tpl = visibleTemplates.find((t) => t.id === selectedId);

    useEffect(() => {
      if (!selectedId || !tab) return;
      const t = visibleTemplates.find((x) => x.id === selectedId);
      if (!t) return;
      setResolving(true); setResolvedVars({}); setResolvedTo('');
      sendMessage(tab.id, { action: 'resolveVars', vars: t.vars || {}, toField: t.toField || { type: 'auto' } }).then((r) => {
        setResolvedVars(r?.resolved || {}); setResolvedTo(r?.toEmail || ''); setResolving(false);
      });
    }, [selectedId, tab, visibleTemplates]);

    useImperativeHandle(ref, () => ({
      openPicker: (b) => setPickerOpen(b),
      selectTemplate: (id, varId = null) => { setSelectedId(id); setSelectedVariationId(varId); },
      getState: () => ({ selectedId, pickerOpen }),
    }), [selectedId, pickerOpen]);

    const openManager = () => onToast?.('Opening the Manager…');

    if (!tab) return <Shell templateCount={0}><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--gb-text-muted)', fontSize: 12, fontWeight: 500, padding: '8px 0' }}><Spinner size={12} /> Scanning page…</div></Shell>;

    return (
      <Shell templateCount={allTemplates.length} minHeight={flags.emailTemplatesEnabled !== false ? 340 : 0} onManage={openManager}>
        <MainView
          templates={visibleTemplates} matchedIds={matchedIds} resolvingIds={resolvingIds}
          selectedId={selectedId} onSelect={setSelectedId} selectedVariationId={selectedVariationId} onSelectVariation={setSelectedVariationId}
          tpl={tpl} resolving={resolving} resolvedVars={resolvedVars} resolvedTo={resolvedTo}
          pageInfo={pageInfo} flags={flags} watchList={watchList}
          pickerOpen={pickerOpen} setPickerOpen={setPickerOpen} onToast={onToast}
        />
      </Shell>
    );
  });

  function MainView({ templates, matchedIds, resolvingIds, selectedId, onSelect, selectedVariationId, onSelectVariation, tpl, resolving, resolvedVars, resolvedTo, pageInfo, flags, watchList, pickerOpen, setPickerOpen, onToast }) {
    const hasRecipient = !!(resolvedTo && resolvedTo.includes('@'));
    const canSend = !!tpl && hasRecipient;
    const pageType = pageInfo.pageType || 'other';
    const knownType = (pageType === 'order' || pageType === 'contact' || pageType === 'account');
    const entityId = pageType === 'order' ? (pageInfo.orderNo || '') : pageType === 'contact' ? (pageInfo.contactId || '') : pageType === 'account' ? (pageInfo.accountId || '') : '';

    const orderTotal = pageInfo.pageOrderTotal || 0;
    const chargeTotal = pageInfo.pageChargeTotal || 0;
    const diff = orderTotal - chargeTotal;
    const chargeReady = !!pageInfo.orderNo && Math.abs(diff) >= 0.005;
    const isRefund = chargeReady && diff < 0;
    const chargeLabel = !pageInfo.orderNo ? 'Charge Card' : !chargeReady ? 'Charge Card' : isRefund ? `Refund  ($${Math.abs(diff).toFixed(2)})` : `Charge Card  ($${diff.toFixed(2)})`;
    const orderEditDisabled = !pageInfo.messageId;
    const watchAddDisabled = !(knownType && entityId);
    const watchCount = watchList.filter((i) => !i.done).length;
    const watchHasCrit = watchList.some((i) => !i.done && (Date.now() - i.addedAt) >= 6 * 3600000);
    const proofDisabled = !(knownType && (pageInfo.contactId || pageInfo.accountId || pageInfo.orderNo));

    const dropdownValue = selectedVariationId ? `${selectedId}::${selectedVariationId}` : (selectedId || '');
    const onPick = (id) => { if (typeof id === 'string' && id.includes('::')) { const [p, v] = id.split('::'); onSelect(p); onSelectVariation(v); return; } onSelect(id); onSelectVariation(null); };

    const paReady = !!flags.powerAutomateEnabled && !!(flags.powerAutomateUrl && String(flags.powerAutomateUrl).trim());
    const replyMode = tpl?.replyMode || 'standalone';
    const sendMode = (() => {
      if (!tpl) return { icon: <I.send />, label: 'Open in Outlook' };
      if (paReady && replyMode === 'reply') return { icon: <I.send />, label: 'Reply' };
      if (paReady) return { icon: <I.send />, label: 'Send' };
      if (replyMode === 'reply') return { icon: <Ic.reply />, label: 'Reply in Outlook' };
      return { icon: <I.send />, label: 'Open in Outlook' };
    })();
    const hasTemplates = templates.length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <AnimatePresence initial={false}>
            {flags.emailTemplatesEnabled && (
              <Reveal key="template-block" gap={0}>
                <SectionLabel divider={false} style={{ marginBottom: 2 }}>Template</SectionLabel>
                <div data-demo="picker">
                  {hasTemplates ? (
                    <TemplatePicker mode="single" templates={templates} matchedIds={matchedIds} resolvingIds={resolvingIds} value={dropdownValue} onChange={onPick} placeholder="Pick a template" listMaxHeight={220} initialOpen={pickerOpen} />
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5, padding: '8px 10px', background: 'var(--gb-fill-subtle)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>No templates for this page type.</div>
                  )}
                </div>
              </Reveal>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {flags.chargeEnabled && (
              <Reveal key="charge"><div data-demo="charge"><Btn full size="sm" variant={chargeReady ? 'tinted' : 'secondary'} status={isRefund ? 'error' : 'brand'} disabled={!chargeReady} icon={<I.card />} onClick={() => onToast?.('Opening the Charge / Refund modal on the order page…')}>{chargeLabel}</Btn></div></Reveal>
            )}
            {flags.orderEditEnabled && (
              <Reveal key="orderEdit"><div data-demo="orderEdit"><Btn full size="sm" disabled={orderEditDisabled} icon={<I.edit />} onClick={() => onToast?.('Opening the Order Edit modal…')}>Order Edit</Btn></div></Reveal>
            )}
            {flags.watchListEnabled && (
              <Reveal key="watch">
                <div data-demo="watch" style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" disabled={watchAddDisabled} icon={<I.eye />} onClick={() => onToast?.('Add this order to your Watch List…')} style={{ flex: 1, minWidth: 0, width: 'auto' }}>{WL_BTN[knownType ? pageType : 'order']}</Btn>
                  <Btn size="sm" variant={watchHasCrit && watchCount > 0 ? 'tinted' : 'secondary'} status="error" icon={<Ic.watch />} badge={watchCount} badgeTone={watchHasCrit ? 'error' : 'brand'} badgePulse={watchHasCrit} onClick={() => onToast?.('Opening your Watch List…')} style={{ flex: 1, minWidth: 0, width: 'auto' }}>Watch List</Btn>
                </div>
              </Reveal>
            )}
            {flags.taskListEnabled && <Reveal key="tasks"><div data-demo="tasks"><Btn full size="sm" icon={<Ic.checkbox />} onClick={() => onToast?.('Opening My Tasks…')}>My Tasks</Btn></div></Reveal>}
            {flags.crmSearchEnabled && <Reveal key="crmSearch"><div data-demo="crmSearch"><Btn full size="sm" icon={<I.search />} onClick={() => onToast?.('Opening CRM Search…')}>CRM Search</Btn></div></Reveal>}
            {flags.submitProofEnabled && <Reveal key="proof"><div data-demo="proof"><Btn full size="sm" disabled={proofDisabled} icon={<Ic.paperclip />} onClick={() => onToast?.('Opening Submit Proof…')}>Submit Proof</Btn></div></Reveal>}
          </AnimatePresence>
        </div>

        <div style={{ flexShrink: 0, paddingTop: 12 }}>
          <AnimatePresence initial={false}>
            {flags.emailTemplatesEnabled && (
              <Reveal key="send-block" gap={14}>
                {hasTemplates && (
                  <div data-demo="resolved">
                    {resolving ? (
                      <div><KeyVal k="To" v={<LoadingVal />} />{Object.entries(tpl?.vars || {}).map(([n, d]) => <KeyVal key={n} k={n} v={<LoadingVal code={d?.type === 'code'} />} />)}</div>
                    ) : (
                      <div><KeyVal k="To" v={resolvedTo || <Tag tone="error" size="xs">Not found</Tag>} tone={hasRecipient ? 'ok' : 'error'} />{Object.entries(resolvedVars).map(([n, val]) => <KeyVal key={n} k={n} v={val ? String(val).slice(0, 40) : <Tag tone="error" size="xs">Not found</Tag>} tone={val ? 'default' : 'error'} />)}</div>
                    )}
                  </div>
                )}
                <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />
                <div data-demo="send"><Btn full variant="primary" size="md" disabled={!hasTemplates || !canSend || resolving} icon={sendMode.icon} onClick={() => onToast?.(paReady ? 'Sending via Power Automate…' : 'Opening this email in Outlook…')}>{sendMode.label}</Btn></div>
              </Reveal>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  window.PopupLive = PopupLive;
})();
