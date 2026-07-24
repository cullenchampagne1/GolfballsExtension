import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Btn, Dropdown, IconBtn, Input } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  bootstrapProductGenerationStudio,
  cancelProductGenerationBatch,
  createProductGenerationBatch,
  createProductGenerationRequestId,
  deleteProductGenerationBatch,
  getProductGenerationBatch,
  isActiveProductGenerationBatch,
  listProductGenerationBatches,
} from '../lib/productGenerationClient.js';

const Camera = (props) => (
  <Icon {...props}>
    <path d="M3 8a2 2 0 012-2h1.5l1-1.6A1 1 0 018.4 4h7.2a1 1 0 01.9.4L17.5 6H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <circle cx="12" cy="12.5" r="3.4" />
  </Icon>
);
const Stack = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <rect x="3" y="11" width="18" height="5" rx="1.5" />
    <path d="M6 19h12" />
  </Icon>
);
const Wand = (props) => (
  <Icon {...props}>
    <path d="M3 21l12-12 2 2L5 23z" transform="translate(0 -2)" />
    <path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5l-1.4 1.4M18.5 8.5l-1.4-1.4" />
  </Icon>
);

const ACTIVE = new Set(['queued', 'running']);
const TONES = {
  queued: ['var(--gb-warning-tint-medium)', 'var(--gb-warning-fg)', 'var(--gb-warning-tint-border)'],
  running: ['var(--gb-brand-tint-medium)', 'var(--gb-brand-label)', 'var(--gb-brand-tint-border)'],
  completed: ['var(--gb-success-tint-medium)', 'var(--gb-success-fg)', 'var(--gb-success-tint-border)'],
  partial: ['var(--gb-warning-tint-medium)', 'var(--gb-warning-fg)', 'var(--gb-warning-tint-border)'],
  failed: ['var(--gb-error-tint-medium)', 'var(--gb-error-fg)', 'var(--gb-error-tint-border)'],
  cancelled: ['var(--gb-fill-soft)', 'var(--gb-text-muted)', 'var(--gb-border-default)'],
};

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById('__gb-mockup-studio-css')) return;
  const style = document.createElement('style');
  style.id = '__gb-mockup-studio-css';
  style.textContent = `
    @keyframes gb-ms-spin { to { transform: rotate(360deg); } }
    @keyframes gb-ms-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    .gb-ms-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-fill-strong) transparent; }
    .gb-ms-scroll::-webkit-scrollbar { width: 7px; height: 7px; }
    .gb-ms-scroll::-webkit-scrollbar-track { background: transparent; }
    .gb-ms-scroll::-webkit-scrollbar-thumb { background: var(--gb-fill-strong); border: 2px solid transparent; background-clip: padding-box; border-radius: 999px; }
    .gb-ms-scroll::-webkit-scrollbar-corner { background: transparent; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function statusTone(status) {
  return TONES[status] || TONES.cancelled;
}

function StatusPill({ status }) {
  const [background, color, border] = statusTone(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 20, padding: '0 7px', borderRadius: 'var(--gb-r-pill)',
      background, color, border: `1px solid ${border}`,
      fontSize: 9.5, fontWeight: 700, textTransform: 'capitalize',
    }}>
      {status === 'running' && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
          boxShadow: '0 0 7px currentColor',
        }} />
      )}
      {String(status || 'unknown').replace('_', ' ')}
    </span>
  );
}

function ProgressBar({ value = 0, status = 'running' }) {
  const complete = status === 'completed';
  return (
    <div style={{
      height: 5, borderRadius: 999, overflow: 'hidden',
      background: 'var(--gb-fill-inverse-medium)',
    }}>
      <motion.div
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{
          height: '100%', borderRadius: 999,
          background: complete ? 'var(--gb-success)' : 'var(--gb-brand-label)',
          boxShadow: '0 0 8px var(--gb-brand-tint-strong)',
        }}
      />
    </div>
  );
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function BatchTray({
  batches, onOpen, onCancel, onDelete, onNew, onClose,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -7, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.98 }}
      transition={{ duration: 0.17 }}
      style={{
        position: 'absolute', top: 52, right: 48, zIndex: 30, width: 360,
        maxHeight: 500, display: 'flex', flexDirection: 'column',
        background: 'var(--gb-surface-float)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-lg)',
        boxShadow: 'var(--gb-shadow-popover)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-fill-inverse-medium)',
      }}>
        <Stack size={14} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
          Render batches
        </span>
        <span style={{ flex: 1 }} />
        <Btn size="xs" variant="ghost" icon={<I.plus />} onClick={onNew}>New</Btn>
        <IconBtn size="xs" icon={<I.close />} onClick={onClose} />
      </div>
      <div className="gb-ms-scroll" style={{ overflowY: 'auto', padding: 7 }}>
        {batches.length === 0 ? (
          <div style={{
            padding: '28px 18px', textAlign: 'center',
            color: 'var(--gb-text-muted)', fontSize: 11.5, lineHeight: 1.55,
          }}>
            No batches yet. Your render history will live here.
          </div>
        ) : batches.map((batch) => {
          const progress = batch.progress || {};
          const active = ACTIVE.has(batch.status);
          return (
            <motion.div
              key={batch.batch_id}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 5,
                padding: 5, marginBottom: 4,
                background: 'transparent', border: '1px solid transparent',
                borderRadius: 'var(--gb-r-md)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--gb-fill-subtle)';
                event.currentTarget.style.borderColor = 'var(--gb-border-subtle)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
                event.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(batch.batch_id)}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                  gap: 10, padding: 4, textAlign: 'left', cursor: 'pointer',
                  color: 'inherit', fontFamily: 'inherit',
                  background: 'transparent', border: 0,
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 'var(--gb-r-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: statusTone(batch.status)[0],
                  border: `1px solid ${statusTone(batch.status)[2]}`,
                  color: statusTone(batch.status)[1], flexShrink: 0,
                }}>
                  {active ? (
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: '2px solid var(--gb-brand-tint-border)',
                      borderTopColor: 'var(--gb-brand-label)',
                      animation: 'gb-ms-spin .75s linear infinite',
                    }}
                    />
                  ) : <Camera size={17} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5,
                  }}>
                    <span style={{
                      flex: 1, minWidth: 0, overflow: 'hidden',
                      whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)',
                    }}>
                      {batch.name || 'Mockup batch'}
                    </span>
                    <span style={{
                      fontSize: 9.5, color: 'var(--gb-text-muted)',
                      fontFamily: 'var(--gb-font-mono)',
                    }}>
                      {progress.completed || 0}/{progress.total || batch.job_count || 0}
                    </span>
                  </div>
                  <ProgressBar value={progress.percent || 0} status={batch.status} />
                  <div style={{
                    marginTop: 5, fontSize: 9.5, color: 'var(--gb-text-muted)',
                  }}>
                    {formatWhen(batch.created_at)}
                  </div>
                </div>
              </button>
              <IconBtn
                size="xs"
                variant="ghost"
                icon={active ? <I.close /> : <I.trash />}
                title={active ? 'Cancel batch' : 'Delete batch'}
                onClick={() => {
                  if (active) onCancel(batch.batch_id);
                  else onDelete(batch.batch_id);
                }}
              />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function OptionGrid({ label, options, value, onChange, aspect = false }) {
  return (
    <div>
      <div style={{
        marginBottom: 7, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.75,
        textTransform: 'uppercase', color: 'var(--gb-text-muted)',
      }}>
        {label}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(options.length || 1, aspect ? 3 : 2)}, minmax(0, 1fr))`,
        gap: 6,
      }}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <motion.button
              type="button"
              key={option.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(option.id)}
              style={{
                minHeight: aspect ? 52 : 58, padding: aspect ? 7 : 8,
                borderRadius: 'var(--gb-r-md)', cursor: 'pointer',
                textAlign: aspect ? 'center' : 'left', fontFamily: 'inherit',
                background: selected
                  ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
                border: `1px solid ${selected
                  ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                color: selected ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                boxShadow: selected ? '0 0 0 1px var(--gb-brand-tint-soft) inset' : 'none',
              }}
            >
              {!aspect && (
                <span style={{
                  display: 'block', width: '100%', height: 15, marginBottom: 6,
                  borderRadius: 4, background: option.swatch || 'var(--gb-fill-soft)',
                  border: '1px solid var(--gb-border-subtle)',
                }}
                />
              )}
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700 }}>
                {option.label}
              </span>
              <span style={{
                display: 'block', marginTop: 2, fontSize: 8.5,
                color: 'var(--gb-text-muted)', lineHeight: 1.25,
              }}>
                {option.description}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function BatchView({ batch, onBack, onCancel, onDelete }) {
  if (!batch) return null;
  const progress = batch.progress || {};
  const active = isActiveProductGenerationBatch(batch);
  return (
    <motion.div
      key={batch.batch_id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        padding: '16px 20px 14px', borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 'var(--gb-r-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: statusTone(batch.status)[0],
            border: `1px solid ${statusTone(batch.status)[2]}`,
            color: statusTone(batch.status)[1],
          }}>
            {active ? (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2.5px solid var(--gb-brand-tint-border)',
                borderTopColor: 'var(--gb-brand-label)',
                animation: 'gb-ms-spin .7s linear infinite',
              }}
              />
            ) : batch.status === 'completed' ? <I.check size={18} /> : <I.alert size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {batch.name}
              </span>
              <StatusPill status={batch.status} />
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--gb-text-muted)' }}>
              {batch.status_message}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 18, fontWeight: 800, color: 'var(--gb-text-primary)',
              fontFamily: 'var(--gb-font-mono)',
            }}>
              {progress.completed || 0}
              <span style={{ color: 'var(--gb-text-ghost)' }}>/{progress.total || batch.job_count || 0}</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>
              images ready
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={progress.percent || 0} status={batch.status} />
        </div>
      </div>
      <div className="gb-ms-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: 20,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}>
          {(batch.jobs || []).map((job) => (
            <div key={job.job_id} style={{
              minHeight: 155, position: 'relative', overflow: 'hidden',
              borderRadius: 'var(--gb-r-lg)',
              background: 'var(--gb-surface-1)',
              border: '1px solid var(--gb-border-default)',
            }}>
              <div style={{
                height: 112, display: 'flex', alignItems: 'center',
                justifyContent: 'center', position: 'relative',
                background: job.status === 'running'
                  ? 'linear-gradient(110deg,var(--gb-fill-subtle) 20%,var(--gb-fill-soft) 45%,var(--gb-fill-subtle) 70%)'
                  : 'var(--gb-fill-inverse-medium)',
                backgroundSize: '220% 100%',
                animation: job.status === 'running'
                  ? 'gb-ms-shimmer 1.5s linear infinite' : 'none',
              }}>
                {job.status === 'completed'
                  ? <I.check size={24} style={{ color: 'var(--gb-success-fg)' }} />
                  : job.status === 'failed'
                    ? <I.alert size={24} style={{ color: 'var(--gb-error-fg)' }} />
                    : <Camera size={24} style={{ color: 'var(--gb-text-ghost)' }} />}
                <span style={{ position: 'absolute', top: 8, right: 8 }}>
                  <StatusPill status={job.status} />
                </span>
              </div>
              <div style={{ padding: '9px 10px' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {job.product?.name || job.product?.id || 'Product mockup'}
                </div>
                <div style={{ marginTop: 2, fontSize: 9.5, color: 'var(--gb-text-muted)' }}>
                  Variation {(Number(job.variation_index) || 0) + 1} · {job.status_message}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        padding: 12, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--gb-fill-inverse-strong)',
        borderTop: '1px solid var(--gb-border-subtle)',
      }}>
        <Btn variant="secondary" size="md" icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={onBack}>
          Back to studio
        </Btn>
        <span style={{ flex: 1 }} />
        {active ? (
          <Btn variant="danger" size="md" icon={<I.close />} onClick={() => onCancel(batch.batch_id)}>
            Cancel batch
          </Btn>
        ) : (
          <Btn variant="ghost" size="md" icon={<I.trash />} onClick={() => onDelete(batch.batch_id)}>
            Delete
          </Btn>
        )}
      </div>
    </motion.div>
  );
}

export function MockupStudio({ onClose }) {
  const toast = useToast();
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [studio, setStudio] = useState(null);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [aspectId, setAspectId] = useState('');
  const [lightingId, setLightingId] = useState('');
  const [variations, setVariations] = useState(1);
  const [trayOpen, setTrayOpen] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const loadingRef = useRef(false);

  useEffect(() => { ensureStyles(); }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState('loading');
    setError('');
    try {
      const payload = await bootstrapProductGenerationStudio();
      setStudio(payload.studio);
      setProducts(payload.products);
      setBatches(payload.batches);
      setSceneId((value) => value || payload.studio.scenes[0]?.id || '');
      setAspectId((value) => value || payload.studio.aspects[0]?.id || '');
      setLightingId((value) => value || payload.studio.lighting[0]?.id || '');
      setState('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Product Mockup Studio is unavailable');
      setState('error');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasActive = batches.some(isActiveProductGenerationBatch);
  useEffect(() => {
    if (!hasActive) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await listProductGenerationBatches();
        if (!cancelled) setBatches(next);
      } catch { /* retain the last durable snapshot during a transient outage */ }
    };
    const timer = setInterval(poll, 2_500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hasActive]);

  useEffect(() => {
    if (!currentBatchId || !hasActive) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const batch = await getProductGenerationBatch(currentBatchId);
        if (cancelled) return;
        setBatches((rows) => [
          batch,
          ...rows.filter((row) => row.batch_id !== batch.batch_id),
        ]);
      } catch { /* list polling still owns the recovery path */ }
    };
    const timer = setInterval(poll, 2_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [currentBatchId, hasActive]);

  const currentBatch = batches.find((batch) => batch.batch_id === currentBatchId) || null;
  const maxProducts = studio?.constraints?.max_products || 5;
  const maxVariations = studio?.constraints?.max_variations || 4;
  const maxImages = studio?.constraints?.max_images || 20;
  const selected = products.filter((product) => selectedIds.includes(product.id));
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => [
      product.title, product.brand, product.category, product.description,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [products, query]);
  const previewScene = studio?.scenes?.find((option) => option.id === sceneId);
  const previewAspect = studio?.aspects?.find((option) => option.id === aspectId);
  const imageCount = selectedIds.length * variations;

  const toggleProduct = (productId) => {
    setSelectedIds((ids) => ids.includes(productId)
      ? ids.filter((id) => id !== productId)
      : ids.length < maxProducts ? [...ids, productId] : ids);
  };

  const createBatch = async () => {
    if (!studio || !selectedIds.length) return;
    const name = selected.length === 1
      ? `${selected[0].title} mockups`
      : `Mockup batch · ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    try {
      const batch = await createProductGenerationBatch({
        studio,
        requestId: createProductGenerationRequestId(),
        name,
        productIds: selectedIds,
        sceneId,
        aspectId,
        lightingId,
        variations,
      });
      setBatches((rows) => [
        batch, ...rows.filter((row) => row.batch_id !== batch.batch_id),
      ]);
      setCurrentBatchId(batch.batch_id);
      setTrayOpen(false);
    } catch (createError) {
      toast.error(createError?.message || 'Unable to create the mockup batch');
    }
  };

  const cancelBatch = async (batchId) => {
    try {
      const batch = await cancelProductGenerationBatch(batchId);
      setBatches((rows) => [
        batch, ...rows.filter((row) => row.batch_id !== batch.batch_id),
      ]);
    } catch (cancelError) {
      toast.error(cancelError?.message || 'Unable to cancel the batch');
    }
  };

  const deleteBatch = async (batchId) => {
    try {
      await deleteProductGenerationBatch(batchId);
      setBatches((rows) => rows.filter((row) => row.batch_id !== batchId));
      if (currentBatchId === batchId) setCurrentBatchId(null);
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Unable to delete the batch');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999990, padding: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-backdrop)',
        backdropFilter: 'var(--gb-backdrop-blur)',
        WebkitBackdropFilter: 'var(--gb-backdrop-blur)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.965, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.975, y: 6 }}
        transition={{ duration: 0.24, ease: [0.34, 1.35, 0.64, 1] }}
        style={{
          width: 'min(1140px, 100%)', height: 'min(780px, 100%)',
          position: 'relative', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', color: 'var(--gb-text-secondary)',
          fontFamily: 'var(--gb-font-sans)',
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl)',
          boxShadow: 'var(--gb-shadow-modal)',
        }}
      >
        <div style={{
          position: 'relative', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          background: 'var(--gb-fill-inverse-strong)',
          borderBottom: '1px solid var(--gb-border-subtle)',
        }}>
          {currentBatch && (
            <IconBtn
              size="md"
              variant="ghost"
              icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
              onClick={() => setCurrentBatchId(null)}
            />
          )}
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--gb-r-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
          }}>
            <Camera size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              Product Mockup Studio
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--gb-text-muted)' }}>
              Photoreal lifestyle renders · {currentBatch
                ? currentBatch.status_message
                : `${products.length} products available`}
            </div>
          </div>
          <Btn
            size="md"
            variant={trayOpen ? 'tinted' : 'secondary'}
            icon={<Stack />}
            badge={batches.length || null}
            badgePulse={hasActive}
            onClick={() => setTrayOpen((value) => !value)}
          >
            Batches
          </Btn>
          <IconBtn size="md" icon={<I.close />} onClick={onClose} />
          <AnimatePresence>
            {trayOpen && (
              <BatchTray
                batches={batches}
                onOpen={(batchId) => {
                  setCurrentBatchId(batchId);
                  setTrayOpen(false);
                }}
                onCancel={cancelBatch}
                onDelete={deleteBatch}
                onNew={() => {
                  setCurrentBatchId(null);
                  setSelectedIds([]);
                  setTrayOpen(false);
                }}
                onClose={() => setTrayOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {currentBatch ? (
            <BatchView
              batch={currentBatch}
              onBack={() => setCurrentBatchId(null)}
              onCancel={cancelBatch}
              onDelete={deleteBatch}
            />
          ) : state === 'loading' ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid var(--gb-border-default)',
                borderTopColor: 'var(--gb-brand-label)',
                animation: 'gb-ms-spin .75s linear infinite',
              }}
              />
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-muted)' }}>
                Opening the studio…
              </span>
            </motion.div>
          ) : state === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 11,
                textAlign: 'center', padding: 30,
              }}
            >
              <div style={{
                width: 46, height: 46, borderRadius: 'var(--gb-r-lg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--gb-error-tint-medium)',
                border: '1px solid var(--gb-error-tint-border)',
                color: 'var(--gb-error-fg)',
              }}>
                <I.alert size={20} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
                Studio unavailable
              </div>
              <div style={{ maxWidth: 420, fontSize: 11.5, color: 'var(--gb-text-muted)' }}>
                {error}
              </div>
              <Btn size="md" variant="primary" icon={<I.refresh />} onClick={load}>
                Try again
              </Btn>
            </motion.div>
          ) : (
            <motion.div
              key="studio"
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <div style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                  borderRight: '1px solid var(--gb-border-subtle)',
                }}>
                  <div style={{
                    padding: '12px 16px', display: 'flex', alignItems: 'center',
                    gap: 10, borderBottom: '1px solid var(--gb-border-subtle)',
                    background: 'var(--gb-fill-inverse-medium)',
                  }}>
                    <Input
                      size="md"
                      value={query}
                      onChange={setQuery}
                      placeholder="Search products to mock up…"
                      leading={<I.search size={13} />}
                      trailing={query ? (
                        <button
                          type="button"
                          onClick={() => setQuery('')}
                          style={{
                            display: 'flex', padding: 0, cursor: 'pointer',
                            border: 0, background: 'transparent',
                            color: 'var(--gb-text-muted)',
                          }}
                        >
                          <I.close size={12} />
                        </button>
                      ) : null}
                      style={{ flex: 1 }}
                    />
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      fontFamily: 'var(--gb-font-mono)',
                      color: selectedIds.length >= maxProducts
                        ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                    }}>
                      {selectedIds.length}/{maxProducts}
                    </span>
                  </div>
                  <div className="gb-ms-scroll" style={{
                    flex: 1, minHeight: 0, overflowY: 'auto', padding: 10,
                  }}>
                    {products.length === 0 ? (
                      <div style={{
                        height: '100%', minHeight: 330,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        textAlign: 'center', padding: 30,
                      }}>
                        <div style={{
                          width: 54, height: 54, borderRadius: 'var(--gb-r-xl)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--gb-brand-tint-soft)',
                          border: '1px dashed var(--gb-brand-tint-border)',
                          color: 'var(--gb-brand-label)',
                        }}>
                          <Camera size={23} />
                        </div>
                        <div style={{
                          marginTop: 14, fontSize: 14, fontWeight: 700,
                          color: 'var(--gb-text-primary)',
                        }}>
                          The studio is ready for products
                        </div>
                        <div style={{
                          marginTop: 6, maxWidth: 370, fontSize: 11.5,
                          lineHeight: 1.6, color: 'var(--gb-text-muted)',
                        }}>
                          No mockup products are configured yet. Add the first
                          product reference and generation recipe to make it
                          selectable here—no extension rebuild required.
                        </div>
                        <div style={{
                          marginTop: 14, display: 'flex', gap: 7,
                          color: 'var(--gb-text-tertiary)', fontSize: 9.5,
                          fontFamily: 'var(--gb-font-mono)',
                        }}>
                          <span>{maxProducts} products max</span>
                          <span>·</span>
                          <span>{maxImages} images max</span>
                        </div>
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div style={{
                        height: '100%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 9,
                        color: 'var(--gb-text-muted)', fontSize: 12,
                      }}>
                        <I.search size={20} />
                        No products match “{query}”
                      </div>
                    ) : filteredProducts.map((product) => {
                      const selectedProduct = selectedIds.includes(product.id);
                      const disabled = !selectedProduct && selectedIds.length >= maxProducts;
                      return (
                        <motion.button
                          type="button"
                          key={product.id}
                          whileTap={disabled ? undefined : { scale: 0.992 }}
                          onClick={() => { if (!disabled) toggleProduct(product.id); }}
                          disabled={disabled}
                          style={{
                            width: '100%', minHeight: 68, marginBottom: 6,
                            display: 'flex', alignItems: 'center', gap: 11,
                            padding: 8, textAlign: 'left', fontFamily: 'inherit',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            color: 'inherit',
                            borderRadius: 'var(--gb-r-md)',
                            background: selectedProduct
                              ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                            border: `1px solid ${selectedProduct
                              ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                          }}
                        >
                          <div style={{
                            width: 52, height: 52, borderRadius: 'var(--gb-r-md)',
                            overflow: 'hidden', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'var(--gb-fill-soft)',
                            border: '1px solid var(--gb-border-subtle)',
                          }}>
                            {product.thumbnail_url
                              ? <img src={product.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              : <Camera size={18} style={{ color: 'var(--gb-text-ghost)' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 700,
                              color: 'var(--gb-text-primary)',
                              whiteSpace: 'nowrap', overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {product.title}
                            </div>
                            <div style={{
                              marginTop: 3, fontSize: 10, color: 'var(--gb-text-muted)',
                            }}>
                              {[product.brand, product.category].filter(Boolean).join(' · ') || 'Mockup product'}
                            </div>
                          </div>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: selectedProduct
                              ? 'var(--gb-brand-label)' : 'var(--gb-fill-subtle)',
                            border: `1px solid ${selectedProduct
                              ? 'var(--gb-brand-border)' : 'var(--gb-border-default)'}`,
                            color: selectedProduct
                              ? 'var(--gb-text-on-brand)' : 'var(--gb-text-ghost)',
                          }}>
                            {selectedProduct ? <I.check size={11} /> : <I.plus size={11} />}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div style={{
                  width: 330, flexShrink: 0, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  background: 'var(--gb-surface-canvas)',
                }}>
                  <div style={{
                    padding: 16, borderBottom: '1px solid var(--gb-border-subtle)',
                  }}>
                    <div style={{
                      marginBottom: 8, fontSize: 9.5, fontWeight: 700,
                      letterSpacing: 0.8, textTransform: 'uppercase',
                      color: 'var(--gb-text-muted)',
                    }}>
                      Scene preview
                    </div>
                    <div style={{
                      position: 'relative', width: '100%',
                      aspectRatio: previewAspect
                        ? `${previewAspect.width} / ${previewAspect.height}` : '1 / 1',
                      maxHeight: 180, overflow: 'hidden', margin: '0 auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--gb-r-md)',
                      background: previewScene?.swatch || 'var(--gb-fill-soft)',
                      border: '1px solid var(--gb-border-default)',
                    }}>
                      {selected.at(-1)?.thumbnail_url ? (
                        <img
                          src={selected.at(-1).thumbnail_url}
                          alt=""
                          style={{
                            width: '62%', height: '62%', objectFit: 'contain',
                            filter: 'drop-shadow(0 15px 16px rgba(0,0,0,.28))',
                          }}
                        />
                      ) : (
                        <div style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 7, color: 'rgba(35,35,30,.52)',
                        }}>
                          <Camera size={22} />
                          <span style={{ fontSize: 10, fontWeight: 700 }}>
                            Product preview
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="gb-ms-scroll" style={{
                    flex: 1, minHeight: 0, overflowY: 'auto',
                    padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
                  }}>
                    <OptionGrid
                      label="Scene"
                      options={studio?.scenes || []}
                      value={sceneId}
                      onChange={setSceneId}
                    />
                    <OptionGrid
                      label="Aspect"
                      aspect
                      options={studio?.aspects || []}
                      value={aspectId}
                      onChange={setAspectId}
                    />
                    <div>
                      <div style={{
                        marginBottom: 7, fontSize: 9.5, fontWeight: 700,
                        letterSpacing: 0.75, textTransform: 'uppercase',
                        color: 'var(--gb-text-muted)',
                      }}>
                        Lighting
                      </div>
                      <Dropdown
                        size="md"
                        value={lightingId}
                        onChange={setLightingId}
                        options={(studio?.lighting || []).map((option) => ({
                          id: option.id,
                          label: option.label,
                          trailing: (
                            <span style={{ fontSize: 9, color: 'var(--gb-text-muted)' }}>
                              {option.description}
                            </span>
                          ),
                        }))}
                      />
                    </div>
                    <div>
                      <div style={{
                        marginBottom: 7, display: 'flex', alignItems: 'center',
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.75,
                        textTransform: 'uppercase', color: 'var(--gb-text-muted)',
                      }}>
                        Variations per product
                        <span style={{
                          marginLeft: 'auto', color: 'var(--gb-brand-label)',
                          fontFamily: 'var(--gb-font-mono)',
                        }}>
                          {variations}
                        </span>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${maxVariations}, 1fr)`,
                        gap: 5, padding: 4, borderRadius: 'var(--gb-r-md)',
                        background: 'var(--gb-fill-inverse-medium)',
                        border: '1px solid var(--gb-border-default)',
                      }}>
                        {Array.from({ length: maxVariations }, (_, index) => index + 1).map((value) => (
                          <motion.button
                            type="button"
                            key={value}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setVariations(value)}
                            style={{
                              height: 27, borderRadius: 'var(--gb-r-sm)',
                              cursor: 'pointer', fontFamily: 'var(--gb-font-mono)',
                              fontSize: 10.5, fontWeight: 700,
                              background: value === variations
                                ? 'var(--gb-brand-label)' : 'transparent',
                              color: value === variations
                                ? 'var(--gb-text-on-brand)' : 'var(--gb-text-muted)',
                              border: value === variations
                                ? '1px solid var(--gb-brand-border)' : '1px solid transparent',
                            }}
                          >
                            {value}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center',
                gap: 10, background: 'var(--gb-fill-inverse-strong)',
                borderTop: '1px solid var(--gb-border-subtle)',
              }}>
                <div style={{
                  flex: 1, minWidth: 0, display: 'flex',
                  alignItems: 'center', gap: 6, overflow: 'hidden',
                }}>
                  {selected.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--gb-text-muted)' }}>
                      Pick up to {maxProducts} products to render mockups for
                    </span>
                  ) : selected.map((product) => (
                    <span key={product.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      maxWidth: 150, padding: '4px 7px',
                      borderRadius: 'var(--gb-r-pill)',
                      background: 'var(--gb-brand-tint-soft)',
                      border: '1px solid var(--gb-brand-tint-border)',
                      color: 'var(--gb-brand-label)', fontSize: 10.5, fontWeight: 600,
                    }}>
                      <span style={{
                        overflow: 'hidden', whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}>
                        {product.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleProduct(product.id)}
                        style={{
                          display: 'flex', padding: 0, border: 0,
                          background: 'transparent', color: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <I.close size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                {selected.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--gb-text-tertiary)' }}>
                    <b style={{
                      color: 'var(--gb-text-primary)',
                      fontFamily: 'var(--gb-font-mono)',
                    }}>
                      {imageCount}
                    </b>
                    {' '}images
                  </span>
                )}
                <Btn
                  size="md"
                  variant="primary"
                  icon={<Wand />}
                  disabled={selected.length === 0 || imageCount > maxImages}
                  onClick={createBatch}
                >
                  Generate mockups
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
