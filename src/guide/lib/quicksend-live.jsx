import React, { useState, useRef, useEffect } from 'react';
import { Btn, Field, RangeSlider, TemplatePicker, Dot, I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   quicksend-live.jsx — a faithful port of the Quick Send runner
   (EmailRunner.jsx) for the guide: the signature progress ring and
   its three phases (Setup → Running → Done), reusing the real
   TemplatePicker, RangeSlider, and ring geometry, self-running on
   sample contacts so the ring actually fills. Used as a cutout on
   the Task List and CRM Search pages (their “Email selected”).
─────────────────────────────────────────────────────────────── */

const RING_BOX = 132, RING_R = 56, RING_SW = 7, RING_CIRC = 2 * Math.PI * RING_R;

const KEYFRAMES_ID = '__gb-quicksend-kf';
function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KEYFRAMES_ID)) return;
  const el = document.createElement('style');
  el.id = KEYFRAMES_ID;
  el.textContent = `
    @keyframes qs-rotate { to { transform: rotate(360deg); } }
    @keyframes qs-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    @keyframes qs-ripple { from { transform: scale(1); opacity: .7; } to { transform: scale(1.5); opacity: 0; } }
    @keyframes qs-state-in { from { transform: translateY(9px); opacity: .4; } to { transform: none; opacity: 1; } }
    @keyframes qs-center-in { from { transform: scale(.8); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes qs-grow-up { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  `;
  (document.head || document.documentElement).appendChild(el);
}

const SAMPLE_TPLS = [
  { id: 't_winback', name: 'Win-back Check-in', type: 'account', variations: [{ id: 'a', preview: 'Warmer' }, { id: 'b', preview: 'Brief' }] },
  { id: 't_followup', name: 'Proposal Follow-up', type: 'account', variations: [] },
];
const SAMPLE_CONTACTS = [
  { name: 'Marcus Chen', email: 'marcus@acme.co' },
  { name: 'Sarah Patel', email: 'sarah@pebble.com' },
  { name: 'Jordan Brown', email: 'jordan@bcg.io' },
];

function HeroRing({ status, settled, total, count }) {
  const running = status === 'running';
  const done = status === 'done';
  const pct = total > 0 ? Math.min(1, settled / total) : (done ? 1 : 0);
  const accent = done ? 'var(--gb-success)' : 'var(--gb-brand-label)';
  const offset = RING_CIRC * (1 - (done ? 1 : pct));
  return (
    <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flexShrink: 0 }}>
      <div aria-hidden style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${done ? 'var(--gb-success-tint-strong)' : 'var(--gb-brand-tint-strong)'} 0%, transparent 68%)`, opacity: running ? 0.9 : done ? 1 : 0.32, filter: 'blur(6px)', transition: 'opacity .5s ease, background .6s ease', animation: running ? 'qs-breathe 2.4s ease-in-out infinite' : 'none' }} />
      {running && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 0deg, transparent 0deg, transparent 250deg, var(--gb-brand-label) 340deg, transparent 360deg)', WebkitMask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)', mask: 'radial-gradient(farthest-side, transparent 0 80%, #000 80.5% 92%, transparent 92.5%)', opacity: 0.85, animation: 'qs-rotate 1.5s linear infinite' }} />
      )}
      <svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
        <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_R} fill="none" stroke="var(--gb-surface-3)" strokeWidth={RING_SW} />
        <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_R} fill="none" stroke={accent} strokeWidth={RING_SW} strokeLinecap="round" strokeDasharray={RING_CIRC} strokeDashoffset={status === 'idle' ? RING_CIRC : offset}
          style={{ transition: 'stroke-dashoffset .55s cubic-bezier(.34,1.4,.64,1), stroke .6s ease', filter: (running || done) ? `drop-shadow(0 0 5px ${accent})` : 'none', opacity: status === 'idle' ? 0 : 1 }} />
      </svg>
      {running && settled > 0 && <span key={settled} aria-hidden style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid var(--gb-brand-label)', animation: 'qs-ripple .7s cubic-bezier(.2,.7,.3,1) forwards', pointerEvents: 'none' }} />}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 2 }}>
        <div key={status} style={{ display: 'grid', placeItems: 'center', animation: 'qs-center-in .4s cubic-bezier(.34,1.4,.64,1) both' }}>
          {status === 'idle' && <div style={{ textAlign: 'center', lineHeight: 1 }}><div style={{ fontSize: 40, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -1 }}>{count}</div><div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 5 }}>queued</div></div>}
          {running && <div style={{ textAlign: 'center', lineHeight: 1 }}><div style={{ fontSize: 36, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -1 }}>{Math.round(pct * 100)}<span style={{ fontSize: 18 }}>%</span></div><div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 5 }}>sending</div></div>}
          {done && <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--gb-success-tint-medium)', border: '1px solid var(--gb-success-tint-border)', color: 'var(--gb-success)', display: 'grid', placeItems: 'center' }}><I.check size={24} /></div>}
        </div>
      </div>
    </div>
  );
}

function StatTile({ value, label, tone }) {
  const c = { success: 'var(--gb-success-fg)', error: 'var(--gb-error-fg)', brand: 'var(--gb-brand-label)', neutral: 'var(--gb-text-secondary)' }[tone] || 'var(--gb-text-secondary)';
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, letterSpacing: -0.3, fontFamily: 'var(--gb-font-mono)' }}>{value}</div>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function QuickSendPanel({ contactCount = 3 }) {
  const [status, setStatus] = useState('idle'); // idle | running | done
  const [tpl, setTpl] = useState('t_winback');
  const [delay, setDelay] = useState([15, 45]);
  const [settled, setSettled] = useState(0);
  const [current, setCurrent] = useState(null);
  const [pacing, setPacing] = useState(null);
  const [trail, setTrail] = useState([]);
  const timers = useRef([]);
  useEffect(() => { ensureKeyframes(); return () => timers.current.forEach(clearTimeout); }, []);

  const contacts = SAMPLE_CONTACTS.slice(0, contactCount);
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; setStatus('idle'); setSettled(0); setCurrent(null); setPacing(null); setTrail([]); };

  const run = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setStatus('running'); setSettled(0); setTrail([]);
    let t = 0;
    contacts.forEach((c, i) => {
      timers.current.push(setTimeout(() => { setCurrent(c); setPacing(null); }, t)); t += 700;
      timers.current.push(setTimeout(() => { setSettled(i + 1); setTrail((cur) => [...cur, { seq: i, name: c.name, status: 'sent' }]); }, t)); t += 200;
      if (i < contacts.length - 1) { timers.current.push(setTimeout(() => { setCurrent(null); setPacing('next send in 0.6s'); }, t)); t += 500; }
    });
    timers.current.push(setTimeout(() => { setStatus('done'); setCurrent(null); setPacing(null); }, t + 200));
  };

  const pct = contacts.length ? settled / contacts.length : 0;
  const subtitle = status === 'idle' ? `${contacts.length} contacts selected` : status === 'running' ? `Sending… · ${settled} of ${contacts.length}` : `All ${contacts.length} delivered`;

  return (
    <div style={{ width: 384, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 26, height: 26, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.send size={13} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Quick Send</div><div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{subtitle}</div></div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', padding: '20px 0 14px', background: 'linear-gradient(180deg, var(--gb-surface-1) 0%, transparent 100%)' }}>
        <HeroRing status={status} settled={settled} total={contacts.length} count={contacts.length} />
      </div>

      <div style={{ padding: '2px 14px 14px' }}>
        <div key={status} style={{ animation: 'qs-state-in .36s cubic-bezier(.34,1.2,.64,1) both' }}>
          {status === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Template" hint="Each contact gets a weighted random pick · 1 of 3 variations">
                <TemplatePicker mode="random" templates={SAMPLE_TPLS} value={tpl} onChange={setTpl} placeholder="Pick a template" floating={false} listMaxHeight={2000} />
              </Field>
              <Field label="Delay between sends" hint="Random per contact — keeps the blast looking human.">
                <RangeSlider value={delay} onChange={setDelay} min={5} max={80} step={5} unit="s" />
              </Field>
              <Btn full variant="primary" size="md" icon={<I.send />} onClick={run}>Run · {contacts.length}</Btn>
            </div>
          )}

          {status === 'running' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10 }}>
                {current ? (<>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{current.name[0]}</div>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{current.name}</div><div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{current.email}</div></div>
                  <div style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gb-brand-label)' }}>Now sending</div>
                </>) : (
                  <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Pacing — {pacing || 'next send…'}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--gb-success-fg)', fontWeight: 600 }}><Dot tone="success" /> {settled} sent</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 600 }}><Dot tone="muted" /> {contacts.length - settled} queued</span>
              </div>
            </div>
          )}

          {status === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.3 }}>All sent</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <StatTile value={contacts.length} label="Sent" tone="success" />
                <StatTile value="100%" label="Success" tone="success" />
                <StatTile value="0:04" label="Elapsed" tone="brand" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, padding: '0 2px' }}>
                {trail.map((r, i) => <div key={r.seq} style={{ flex: 1, borderRadius: 2, height: '100%', background: 'var(--gb-success)', opacity: 0.85, animation: `qs-grow-up .4s cubic-bezier(.34,1.3,.64,1) ${i * 0.04}s both`, transformOrigin: 'bottom' }} title={`${r.name} · sent`} />)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="secondary" onClick={reset} style={{ flex: 1 }}>Close</Btn>
                <Btn size="sm" variant="tinted" status="brand" icon={<I.refresh size={11} />} onClick={run} style={{ flex: 1 }}>Send again</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
