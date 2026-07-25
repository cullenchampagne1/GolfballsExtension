import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';

import {
  Btn, IconBtn, Input, ModalHeader, ModalFooter,
} from '../ui/index.js';
import {
  ZOOM_MAX, ZOOM_MIN, ZOOM_BUTTON_STEP, framePoint, wheelZoom, zoomToPoint,
} from '../lib/imageZoom.js';
import { Icon, I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  bootstrapProductGenerationStudio,
  cancelProductGenerationBatch,
  createDefaultProductGenerationSelection,
  createProductGenerationBatch,
  createProductGenerationRequestId,
  deleteProductGenerationBatch,
  getProductGenerationBatch,
  getProductGenerationResult,
  isActiveProductGenerationBatch,
  listProductGenerationBatches,
  mergeProductGenerationBatch,
  normalizeProductGenerationBatchId,
  prepareProductGenerationLogo,
  PRODUCT_GENERATION_OPEN_BATCH_EVENT,
  resolveProductGenerationFacet,
  updateProductGenerationFacetSelection,
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

// Admin-only: the catalog authoring sub-modal ships only in the admin build.
// The lazy import lives inside an `__ADMIN__` branch, so the served build
// (__ADMIN__ === false → null) never references MockupCatalogAdmin and esbuild
// leaves the whole module — and its authoring transport — out of the bundle.
const LOAD_CATALOG_ADMIN = __ADMIN__
  ? () => import('./MockupCatalogAdmin.jsx').then((m) => m.MockupCatalogAdmin)
  : null;

const ACTIVE = new Set(['queued', 'running']);
// Gallery tiles are a constant size regardless of how many a batch holds.
// The card is wider than its image band is tall, so a row of results reads as
// a row rather than a column of portrait slabs.
const GALLERY_TILE = 232;
const GALLERY_IMAGE = 176;
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
    /* A pending tile breathes rather than sweeping a highlight across itself:
       a whole wall of shimmering cards reads as noise, and the sweep competes
       with the artwork that lands in the same box a moment later. */
    @keyframes gb-ms-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
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

function saveResultAsset(asset, fallbackName = 'product-mockup.png') {
  if (!asset?.dataUrl || typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = asset.dataUrl;
  anchor.download = asset.filename || fallbackName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function useResultAsset(job, enabled = true) {
  const available = job?.status === 'completed' && job?.result?.available;
  const [state, setState] = useState({
    jobId: job?.job_id || '', asset: null, loading: false, error: '',
  });
  useEffect(() => {
    const jobId = job?.job_id || '';
    if (!enabled || !available || !jobId) return undefined;
    let cancelled = false;
    setState((current) => (
      current.jobId === jobId && current.asset
        ? current
        : { jobId, asset: null, loading: true, error: '' }
    ));
    getProductGenerationResult(jobId).then((asset) => {
      if (!cancelled) setState({ jobId, asset, loading: false, error: '' });
    }).catch((error) => {
      if (!cancelled) {
        setState({
          jobId, asset: null, loading: false,
          error: error?.message || 'Preview unavailable',
        });
      }
    });
    return () => { cancelled = true; };
  }, [available, enabled, job?.job_id]);
  return state.jobId === job?.job_id
    ? state : { asset: null, loading: Boolean(available), error: '' };
}

function ResultArtwork({
  job, compact = false, enabled = true,
}) {
  const { asset, loading, error } = useResultAsset(job, enabled);
  const ready = job?.status === 'completed' && job?.result?.available;
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      background: ready
        ? 'var(--gb-fill-soft)' : 'var(--gb-fill-inverse-medium)',
    }}>
      {asset?.dataUrl ? (
        <motion.img
          initial={{ opacity: 0, scale: 1.025 }}
          animate={{ opacity: 1, scale: 1 }}
          src={asset.dataUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : loading ? (
        <span style={{
          width: compact ? 12 : 19, height: compact ? 12 : 19,
          borderRadius: '50%',
          border: `${compact ? 1.5 : 2}px solid var(--gb-brand-tint-border)`,
          borderTopColor: 'var(--gb-brand-label)',
          animation: 'gb-ms-spin .7s linear infinite',
        }}
        />
      ) : error ? (
        <I.alert
          size={compact ? 12 : 22}
          style={{ color: 'var(--gb-error-fg)' }}
        />
      ) : ready ? (
        <I.check
          size={compact ? 12 : 22}
          style={{ color: 'var(--gb-success-fg)' }}
        />
      ) : job?.status === 'failed' ? (
        <I.alert
          size={compact ? 12 : 22}
          style={{ color: 'var(--gb-error-fg)' }}
        />
      ) : (
        <Camera
          size={compact ? 12 : 22}
          style={{ color: 'var(--gb-text-ghost)' }}
        />
      )}
    </div>
  );
}

function BatchCollage({ batch }) {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const jobs = (batch?.jobs || []).filter(
    (job) => job.status === 'completed' && job.result?.available,
  ).slice(0, 4);
  useEffect(() => {
    if (!jobs.length) return undefined;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '60px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [batch?.batch_id, jobs.length]);
  if (!jobs.length) return null;
  return (
    <div
      ref={rootRef}
      style={{
        width: 42, height: 42, flexShrink: 0, overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: jobs.length === 1 ? '1fr' : 'repeat(2, 1fr)',
        gridTemplateRows: jobs.length < 3 ? '1fr' : 'repeat(2, 1fr)',
        gap: 1, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-border-subtle)',
        border: '1px solid var(--gb-border-default)',
      }}
    >
      {jobs.map((job) => (
        <ResultArtwork
          key={job.job_id}
          job={job}
          compact
          enabled={visible}
        />
      ))}
    </div>
  );
}

function BatchTray({
  batches, onOpen, onCancel, onDelete, onClose, panelRef,
}) {
  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -7, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.98 }}
      transition={{ duration: 0.17 }}
      style={{
        position: 'absolute', top: 'calc(100% - 4px)', right: 42,
        zIndex: 30, width: 360,
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
        <Btn
          size="xs"
          variant="ghost"
          icon={<Stack />}
          disabled
          title="Full batch history is coming soon"
        >
          View all
        </Btn>
        <IconBtn
          size="sm"
          icon={<I.close />}
          title="Close batch menu"
          aria-label="Close batch menu"
          onClick={onClose}
        />
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
                <BatchCollage batch={batch} />
                {!(batch.jobs || []).some(
                  (job) => job.status === 'completed' && job.result?.available,
                ) && (
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
                )}
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

function ReferenceGrid({
  label, helper, options, values, onToggle,
}) {
  const selected = new Set(values || []);
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.75,
          textTransform: 'uppercase', color: 'var(--gb-text-muted)',
        }}>
          {label}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 9, color: 'var(--gb-text-ghost)',
        }}>
          {selected.size} selected
        </span>
      </div>
      {helper && (
        <div style={{
          margin: '-2px 0 8px', fontSize: 9.5, lineHeight: 1.4,
          color: 'var(--gb-text-muted)',
        }}>
          {helper}
        </div>
      )}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7,
      }}>
        {(options || []).map((option) => {
          const isSelected = selected.has(option.id);
          return (
            <motion.button
              type="button"
              key={option.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onToggle(option.id)}
              style={{
                minWidth: 0, padding: 5, cursor: 'pointer',
                borderRadius: 'var(--gb-r-md)', textAlign: 'left',
                fontFamily: 'inherit', overflow: 'hidden',
                background: isSelected
                  ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                border: `1px solid ${isSelected
                  ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                color: isSelected ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
              }}
            >
              <span style={{
                position: 'relative', display: 'flex', width: '100%',
                aspectRatio: '4 / 3', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', borderRadius: 'calc(var(--gb-r-md) - 3px)',
                background: 'var(--gb-fill-soft)',
                border: '1px solid var(--gb-border-subtle)',
              }}>
                {option.thumbnail_url ? (
                  <img
                    src={option.thumbnail_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : <Camera size={18} style={{ color: 'var(--gb-text-ghost)' }} />}
                <span style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 20, height: 20, borderRadius: 'var(--gb-r-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected
                    ? 'var(--gb-brand-label)' : 'var(--gb-surface-float)',
                  border: `1px solid ${isSelected
                    ? 'var(--gb-brand-border)' : 'var(--gb-border-default)'}`,
                  color: isSelected ? 'var(--gb-text-on-brand)' : 'var(--gb-text-ghost)',
                  boxShadow: 'var(--gb-shadow-sm)',
                }}>
                  {isSelected ? <I.check size={10} /> : <I.plus size={10} />}
                </span>
              </span>
              <span style={{
                display: 'block', margin: '6px 3px 1px', fontSize: 10,
                fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {option.label}
              </span>
              {option.description && (
                <span style={{
                  display: '-webkit-box', margin: '0 3px 3px', fontSize: 8.5,
                  lineHeight: 1.3, color: 'var(--gb-text-muted)',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {option.description}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The persistent top bar of the product picker.
 *
 * It always occupies the same slot: once a logo is uploaded it confirms the
 * artwork with Replace/Remove; until then it REQUESTS the logo in place — a
 * compact drop target — instead of a full-page upload screen taking over the
 * whole list. The product list stays visible (greyed) the entire time, so a
 * rep can see what is available before committing artwork.
 */
function TopLogoBar({ logo, busy, inputRef, onChoose, onClear }) {
  const [dragging, setDragging] = useState(false);
  const accept = (file) => { setDragging(false); if (file) onChoose(file); };
  const dropHandlers = logo ? {} : {
    onDragEnter: (event) => { event.preventDefault(); setDragging(true); },
    onDragOver: (event) => { event.preventDefault(); setDragging(true); },
    onDragLeave: (event) => {
      event.preventDefault();
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    },
    onDrop: (event) => { event.preventDefault(); accept(event.dataTransfer?.files?.[0] || null); },
  };
  return (
    <div
      {...dropHandlers}
      style={{
        flexShrink: 0, minHeight: 66, padding: '9px 14px',
        display: 'flex', alignItems: 'center', gap: 11, overflow: 'hidden',
        background: logo ? 'var(--gb-brand-tint-soft)'
          : dragging ? 'var(--gb-brand-tint-medium)' : 'var(--gb-warning-tint-soft)',
        borderBottom: `1px solid ${logo ? 'var(--gb-brand-tint-border)'
          : dragging ? 'var(--gb-brand-border)' : 'var(--gb-warning-tint-border)'}`,
        transition: 'background .16s, border-color .16s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => accept(event.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
      <span style={{
        width: 46, height: 46, flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-float)',
        border: `1px ${logo ? 'solid var(--gb-border-default)' : 'dashed var(--gb-warning-tint-border)'}`,
        color: 'var(--gb-warning-fg)', boxShadow: logo ? 'var(--gb-shadow-sm)' : 'none',
      }}>
        {busy ? (
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid var(--gb-brand-tint-border)',
            borderTopColor: 'var(--gb-brand-label)',
            animation: 'gb-ms-spin .75s linear infinite',
          }} />
        ) : logo ? (
          <img
            src={`data:${logo.mediaType};base64,${logo.dataBase64}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : <I.upload size={19} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10.5, fontWeight: 750,
          color: logo ? 'var(--gb-brand-label)' : 'var(--gb-warning-fg)',
        }}>
          {logo ? <I.check size={11} /> : <I.alert size={11} />}
          {logo ? 'Artwork uploaded' : 'Add the customer logo to begin'}
        </span>
        <span style={{
          display: 'block', marginTop: 3, fontSize: 10,
          color: 'var(--gb-text-muted)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {logo
            ? `${logo.filename} · ${(Number(logo.sizeBytes || 0) / 1024).toFixed(0)} KB`
            : 'Drop artwork here or upload — every mockup is built from it. PNG · JPEG · WebP · 12 MB'}
        </span>
      </span>
      <Btn
        size="sm"
        variant={logo ? 'secondary' : 'primary'}
        icon={logo ? undefined : <I.upload />}
        onClick={() => inputRef.current?.click()}
      >
        {logo ? 'Replace' : 'Upload artwork'}
      </Btn>
      {logo && (
        <IconBtn
          size="sm"
          variant="ghost"
          title="Remove artwork"
          icon={<I.close />}
          onClick={onClear}
        />
      )}
    </div>
  );
}

function FacetGrid({
  group, product, selection, onChange,
}) {
  const currentValues = selection?.optionValues || {};
  const groupIndex = (product.option_groups || []).findIndex(
    (candidate) => candidate.id === group.id,
  );
  const selectsOutputs = groupIndex === (product.option_groups || []).length - 1;
  const selectedSources = new Set(selection?.sourceIds || []);
  const presentation = ['thumbnail', 'swatch', 'button'].includes(group.presentation)
    ? group.presentation : 'button';
  const columns = Math.max(
    1,
    Math.min(6, Number(group.columns) || Math.min(group.options?.length || 1, 3)),
  );
  const showsThumbnails = presentation === 'thumbnail';
  const showsSwatches = presentation === 'swatch';
  return (
    <div>
      <div style={{
        marginBottom: 7, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.75,
        textTransform: 'uppercase', color: 'var(--gb-text-muted)',
      }}>
        {group.label}
        {selectsOutputs && (
          <span style={{
            float: 'right', textTransform: 'none', letterSpacing: 0,
            fontSize: 9, fontWeight: 600, color: 'var(--gb-text-ghost)',
          }}>
            {selectedSources.size} image{selectedSources.size === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {group.description && (
        <div style={{
          margin: '-2px 0 8px', fontSize: 9.5, lineHeight: 1.4,
          color: 'var(--gb-text-muted)',
        }}>
          {group.description}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 7,
      }}>
        {(group.options || []).map((option) => {
          const resolved = resolveProductGenerationFacet({
            product,
            currentOptionValues: currentValues,
            groupId: group.id,
            optionId: option.id,
          });
          const source = (product.sources || []).find(
            (candidate) => candidate.id === resolved?.sourceId,
          );
          const selected = selectsOutputs
            ? Boolean(source && selectedSources.has(source.id))
            : currentValues[group.id] === option.id;
          return (
            <motion.button
              type="button"
              key={option.id}
              whileTap={source ? { scale: 0.96 } : undefined}
              disabled={!source}
              onClick={() => source && onChange(group.id, option.id)}
              style={{
                minWidth: 0, minHeight: showsThumbnails ? 76 : 43,
                padding: showsThumbnails ? 5 : 7,
                display: 'flex', flexDirection: showsThumbnails ? 'column' : 'row',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 'var(--gb-r-md)', cursor: source ? 'pointer' : 'not-allowed',
                opacity: source ? 1 : 0.35, fontFamily: 'inherit',
                background: selected
                  ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                border: `1px solid ${selected
                  ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                color: selected ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
              }}
            >
              {showsThumbnails && source?.thumbnail_url ? (
                <span style={{
                  width: '100%', height: 48, overflow: 'hidden',
                  borderRadius: 'calc(var(--gb-r-md) - 3px)',
                  border: '1px solid var(--gb-border-subtle)',
                  background: 'var(--gb-fill-soft)',
                }}>
                  <img
                    src={source.thumbnail_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </span>
              ) : showsSwatches && option.swatch ? (
                <span style={{
                  width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                  background: option.swatch,
                  border: '1px solid rgba(127,127,127,.38)',
                  boxShadow: selected ? '0 0 0 2px var(--gb-brand-tint-border)' : 'none',
                }}
                />
              ) : null}
              <span style={{
                maxWidth: '100%', fontSize: 9.5, fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {option.label}
              </span>
              {selectsOutputs && (
                <span style={{
                  width: 16, height: 16, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--gb-r-sm)',
                  background: selected
                    ? 'var(--gb-brand-label)' : 'var(--gb-fill-subtle)',
                  border: `1px solid ${selected
                    ? 'var(--gb-brand-border)' : 'var(--gb-border-default)'}`,
                  color: selected
                    ? 'var(--gb-text-on-brand)' : 'var(--gb-text-ghost)',
                }}>
                  {selected ? <I.check size={9} /> : <I.plus size={9} />}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function FacetedSelectionTags({
  product, selection, onRemoveProduct, onRemoveSource,
}) {
  const sources = (product.sources || []).filter(
    (source) => (selection.sourceIds || []).includes(source.id),
  );
  if (!sources.length) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        flex: '1 1 170px', minWidth: 40, maxWidth: 250,
        padding: '5px 7px', overflow: 'hidden',
        borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-warning-tint-medium)',
        border: '1px solid var(--gb-warning-tint-border)',
        color: 'var(--gb-warning-fg)', fontSize: 9.5, fontWeight: 700,
      }}>
        {product.title} · choose an image
        <button
          type="button"
          title="Remove product"
          onClick={onRemoveProduct}
          style={{
            display: 'flex', padding: 0, border: 0,
            background: 'transparent', color: 'inherit', cursor: 'pointer',
          }}
        >
          <I.close size={9} />
        </button>
      </span>
    );
  }
  return sources.map((source) => {
    const details = (product.option_groups || []).map((group) => {
      const option = (group.options || []).find(
        (candidate) => candidate.id === source.option_values?.[group.id],
      );
      return option ? `${group.label}: ${option.label}` : '';
    }).filter(Boolean);
    return (
      <span
        key={source.id}
        title={[product.title, ...details].join(' · ')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          flex: '1 1 170px', minWidth: 40, maxWidth: 260,
          padding: '4px 6px 4px 8px', overflow: 'hidden',
          borderRadius: 'var(--gb-r-md)',
          background: 'var(--gb-brand-tint-soft)',
          border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{
            display: 'block', maxWidth: 230, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 9.5, fontWeight: 750,
          }}>
            {product.title}
          </span>
          <span style={{
            display: 'block', marginTop: 1, maxWidth: 230,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 8.5, fontWeight: 650, color: 'var(--gb-text-muted)',
          }}>
            {details.join(' · ') || source.label}
          </span>
        </span>
        <button
          type="button"
          title="Remove this image"
          onClick={() => onRemoveSource(source.id)}
          style={{
            width: 18, height: 18, flexShrink: 0, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--gb-r-sm)', cursor: 'pointer',
            background: 'var(--gb-fill-subtle)',
            border: '1px solid var(--gb-border-subtle)',
            color: 'inherit',
          }}
        >
          <I.close size={9} />
        </button>
      </span>
    );
  });
}

function BatchStat({ label, value, tone }) {
  return (
    <div style={{
      flex: '1 1 64px', minWidth: 62, padding: '7px 9px',
      borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-subtle)',
    }}>
      <div style={{
        fontSize: 14, lineHeight: 1, fontWeight: 800,
        fontFamily: 'var(--gb-font-mono)', color: tone,
      }}>
        {value}
      </div>
      <div style={{
        marginTop: 4, fontSize: 8.5, fontWeight: 700,
        letterSpacing: 0.55, textTransform: 'uppercase',
        color: 'var(--gb-text-muted)',
      }}>
        {label}
      </div>
    </div>
  );
}

function FullResultViewer({ job, onBack }) {
  const { asset, loading, error } = useResultAsset(job, true);
  const [view, setView] = useState({ zoom: ZOOM_MIN, offset: { x: 0, y: 0 } });
  const { zoom, offset } = view;
  const dragRef = useRef(null);
  const frameRef = useRef(null);

  const reset = useCallback(
    () => setView({ zoom: ZOOM_MIN, offset: { x: 0, y: 0 } }), [],
  );
  useEffect(() => { reset(); }, [job?.job_id, reset]);

  const pointOf = (clientX, clientY) => framePoint(
    frameRef.current?.getBoundingClientRect(), clientX, clientY,
  );

  const zoomAt = useCallback((nextZoom, clientX, clientY) => {
    setView((current) => zoomToPoint(
      current, nextZoom,
      clientX == null ? { x: 0, y: 0 } : pointOf(clientX, clientY),
    ));
  }, []);

  /* Registered natively with { passive: false }.
   *
   * React attaches wheel handlers to its root as PASSIVE, so preventDefault()
   * from an onWheel prop is ignored and the CRM page keeps scrolling behind
   * the modal while you zoom. Only a non-passive native listener can cancel
   * it, and it has to be bound to the frame element itself. */
  const ready = !!asset?.dataUrl;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !ready) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const point = framePoint(frame.getBoundingClientRect(), event.clientX, event.clientY);
      setView((current) => zoomToPoint(
        current, wheelZoom(current.zoom, event.deltaY), point,
      ));
    };
    frame.addEventListener('wheel', handler, { passive: false });
    return () => frame.removeEventListener('wheel', handler);
  }, [ready]);

  const onPointerDown = useCallback((event) => {
    if (zoom <= ZOOM_MIN || !asset?.dataUrl) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originX: offset.x, originY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [zoom, offset, asset?.dataUrl]);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      offset: {
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      },
    }));
  }, []);

  const endDrag = useCallback((event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--gb-surface-canvas)',
    }}>
      <div style={{
        minHeight: 46, padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--gb-fill-inverse-medium)',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        <IconBtn
          size="sm"
          variant="ghost"
          title="Back to all images"
          icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
          onClick={onBack}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 750, color: 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {job.product?.name || 'Product mockup'}
          </div>
          <div style={{
            marginTop: 2, fontSize: 9.5, color: 'var(--gb-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {[job.source?.label, job.variation?.label].filter(Boolean).join(' · ')}
          </div>
        </div>
        {asset?.dataUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, padding: 2,
            borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-default)',
          }}>
            <IconBtn
              size="xs" variant="ghost" title="Zoom out"
              icon={<I.close style={{ transform: 'rotate(45deg)' }} />}
              disabled={zoom <= ZOOM_MIN}
              onClick={() => zoomAt(zoom / ZOOM_BUTTON_STEP)}
            />
            <button
              type="button"
              onClick={reset}
              title="Reset zoom"
              style={{
                minWidth: 38, height: 20, padding: '0 4px', cursor: 'pointer',
                border: 0, background: 'transparent', fontFamily: 'var(--gb-font-mono)',
                fontSize: 9.5, fontWeight: 700,
                color: zoom > ZOOM_MIN ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconBtn
              size="xs" variant="ghost" title="Zoom in"
              icon={<I.plus />}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => zoomAt(zoom * ZOOM_BUTTON_STEP)}
            />
          </div>
        )}
        <Btn
          size="sm"
          variant="primary"
          icon={<I.download />}
          disabled={!asset?.dataUrl}
          onClick={() => saveResultAsset(
            asset, job.result?.filename || `${job.job_id}.png`,
          )}
        >
          Download
        </Btn>
      </div>
      <div style={{
        flex: 1, minHeight: 0, padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-surface-canvas)',
      }}>
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(event) => (
            zoom > ZOOM_MIN ? reset() : zoomAt(2.5, event.clientX, event.clientY)
          )}
          style={{
            // Driven from HEIGHT so the square shrinks to fit a short panel
            // instead of keeping its width and clipping the bottom off.
            height: 'min(100%, 620px)', aspectRatio: '1 / 1', maxWidth: '100%',
            overflow: 'hidden', display: 'flex', position: 'relative',
            alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
            cursor: !asset?.dataUrl ? 'default'
              : zoom > ZOOM_MIN ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
            borderRadius: 'var(--gb-r-lg)',
            background: 'var(--gb-fill-soft)',
            border: '1px solid var(--gb-border-default)',
            boxShadow: 'var(--gb-shadow-lg)',
          }}
        >
          {asset?.dataUrl ? (
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              src={asset.dataUrl}
              alt=""
              draggable={false}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                // No transition while dragging — the pan must track the pointer.
                transition: dragRef.current ? 'none' : 'transform .16s cubic-bezier(.4,0,.2,1)',
                willChange: 'transform',
                userSelect: 'none',
              }}
            />
          ) : loading ? (
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '2.5px solid var(--gb-brand-tint-border)',
              borderTopColor: 'var(--gb-brand-label)',
              animation: 'gb-ms-spin .7s linear infinite',
            }}
            />
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
              color: error ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)',
              fontSize: 10.5,
            }}>
              {error ? <I.alert size={22} /> : <Camera size={22} />}
              {error || 'Image preview unavailable'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One gallery tile: a square image with a SOLID information bar beneath it.
 *
 * The caption and actions were briefly overlaid on the artwork to keep the
 * tile itself 1:1, but icons floating on a photograph have no reliable
 * contrast — a light mockup swallowed them. The bar is its own opaque surface
 * again, so the controls always sit on a known background; only the IMAGE is
 * square, which is what actually needed to be.
 */
function ResultCard({ job, onOpen }) {
  const ready = job.status === 'completed' && job.result?.available;
  const { asset } = useResultAsset(job, ready);
  const pending = job.status === 'running' || job.status === 'queued';
  const caption = [job.source?.label, job.variation?.label]
    .filter(Boolean).join(' · ') || job.status_message;
  return (
    <div style={{
      width: GALLERY_TILE, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      borderRadius: 'var(--gb-r-lg)',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      boxShadow: ready ? 'var(--gb-shadow-sm)' : 'none',
    }}>
      {/* The band has a FIXED height, and the square photo is centred inside it
          rather than filling the card width. A wider card would otherwise mean
          a taller square — this keeps the image square while letting the card
          be wider than it is tall. */}
      <div style={{
        width: '100%', height: GALLERY_IMAGE, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-fill-inverse-medium)',
        animation: pending ? 'gb-ms-breathe 2.4s ease-in-out infinite' : 'none',
      }}>
        <div style={{
          height: '100%', aspectRatio: '1 / 1', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <ResultArtwork job={job} />
        </div>
        {/* A finished image announces itself; only an unfinished one needs a
            word for it, and running already has its own loading treatment. */}
        {job.status !== 'completed' && (
          <span style={{ position: 'absolute', top: 7, right: 7 }}>
            <StatusPill status={job.status} />
          </span>
        )}
      </div>
      <div style={{
        padding: '6px 5px 6px 8px',
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'var(--gb-fill-inverse-strong)',
        borderTop: '1px solid var(--gb-border-subtle)',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            title={job.product?.name || ''}
            style={{
              display: 'block', fontSize: 9.5, fontWeight: 750,
              color: 'var(--gb-text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {job.product?.name || job.product?.id || 'Product mockup'}
          </span>
          <span
            title={caption}
            style={{
              display: 'block', fontSize: 8.5, color: 'var(--gb-text-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {caption}
          </span>
        </span>
        {ready && (
          <span style={{ flexShrink: 0, display: 'flex', gap: 2 }}>
            <IconBtn
              size="xs"
              variant="ghost"
              title="View full image"
              icon={<I.eye />}
              onClick={onOpen}
            />
            <IconBtn
              size="xs"
              variant="ghost"
              title="Download this image"
              icon={<I.download />}
              disabled={!asset?.dataUrl}
              onClick={() => saveResultAsset(
                asset, job.result?.filename || `${job.job_id}.png`,
              )}
            />
          </span>
        )}
      </div>
    </div>
  );
}

function BatchView({ batch, onBack, onCancel, onDelete }) {
  const [previewJobId, setPreviewJobId] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const jobs = batch?.jobs || [];
  const readyJobs = useMemo(
    () => jobs.filter((job) => job.status === 'completed' && job.result?.available),
    [jobs],
  );

  /* Saved one at a time with a beat between each: Chrome silently drops
     same-tick anchor downloads after the first few, so a batch of twenty would
     otherwise land as three files with no error anywhere. */
  const downloadAll = useCallback(async () => {
    if (!readyJobs.length) return;
    setDownloadingAll(true);
    setDownloadedCount(0);
    try {
      for (const job of readyJobs) {
        try {
          const asset = await getProductGenerationResult(job.job_id);
          saveResultAsset(asset, job.result?.filename || `${job.job_id}.png`);
        } catch { /* skip the one that failed; the rest still save */ }
        setDownloadedCount((count) => count + 1);
        await new Promise((resolve) => { setTimeout(resolve, 260); });
      }
    } finally {
      setDownloadingAll(false);
    }
  }, [readyJobs]);

  if (!batch) return null;
  const progress = batch.progress || {};
  const active = isActiveProductGenerationBatch(batch);
  const previewJob = jobs.find(
    (job) => job.job_id === previewJobId,
  ) || null;
  const total = progress.total || batch.job_count || 0;
  const issueCount = (progress.failed || 0) + (progress.cancelled || 0);
  return (
    <motion.div
      key={batch.batch_id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      style={{
        flex: 1, minHeight: 0, position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <ModalHeader
        icon={active ? (
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid var(--gb-brand-tint-border)',
            borderTopColor: 'var(--gb-brand-label)',
            animation: 'gb-ms-spin .7s linear infinite',
          }}
          />
        ) : batch.status === 'completed' ? <I.check /> : <I.alert />}
        title={batch.name || 'Mockup gallery'}
        subtitle={[batch.status_message, formatWhen(batch.created_at)]
          .filter(Boolean).join(' · ')}
        right={<StatusPill status={batch.status} />}
        onClose={onBack}
      />
      <div style={{
        padding: '9px 12px',
        display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 7,
        flexShrink: 0,
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
          <BatchStat label="Ready" value={progress.completed || 0} tone="var(--gb-success-fg)" />
          <BatchStat label="Generating" value={progress.running || 0} tone="var(--gb-brand-label)" />
          <BatchStat label="Waiting" value={progress.queued || 0} tone="var(--gb-warning-fg)" />
          <BatchStat label="Issues" value={issueCount} tone={issueCount ? 'var(--gb-error-fg)' : 'var(--gb-text-ghost)'} />
          <div style={{
            flex: '2 1 160px', minWidth: 120, padding: '7px 10px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-fill-subtle)',
            border: '1px solid var(--gb-border-subtle)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              marginBottom: 6, fontSize: 9, color: 'var(--gb-text-muted)',
            }}>
              <span>Overall progress</span>
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--gb-font-mono)',
                fontWeight: 750, color: 'var(--gb-text-primary)',
              }}>
                {progress.processed || 0}/{total}
              </span>
            </div>
            <ProgressBar value={progress.percent || 0} status={batch.status} />
          </div>
      </div>
      {/* Enlarging REPLACES the grid in place rather than floating another
          layer over it. The batch header and footer stay put, so the stack
          never reads as a modal inside a modal inside a modal. */}
      <AnimatePresence initial={false} mode="popLayout">
        {previewJob ? (
          <motion.div
            key="viewer"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            <FullResultViewer
              job={previewJob}
              onBack={() => setPreviewJobId('')}
            />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            className="gb-ms-scroll"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              flex: 1, minHeight: 0, overflowY: 'auto', padding: 14,
              background: 'var(--gb-surface-2)',
            }}
          >
            {batch.loading ? (
              <div style={{
                height: '100%', minHeight: 180,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                color: 'var(--gb-text-muted)', fontSize: 11,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '2.5px solid var(--gb-brand-tint-border)',
                  borderTopColor: 'var(--gb-brand-label)',
                  animation: 'gb-ms-spin .7s linear infinite',
                }}
                />
                Loading your mockup gallery…
              </div>
            ) : (
              /* A FIXED column width, not 1fr: stretching one or two results to
                 330-400px made every tile a near-full-size preview and left the
                 viewer with nothing to add. Tiles stay a constant square. */
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, ${GALLERY_TILE}px)`,
                // Pack from the top-left rather than centring the row, so a
                // partial last row lines up under the first card.
                justifyContent: 'start',
                gap: 12,
              }}>
                {jobs.map((job) => (
                  <ResultCard
                    key={job.job_id}
                    job={job}
                    onOpen={() => setPreviewJobId(job.job_id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ModalFooter style={{ minHeight: 50, padding: '9px 12px' }}>
        {previewJob && (
          <Btn
            variant="secondary"
            size="sm"
            icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
            onClick={() => setPreviewJobId('')}
          >
            All images
          </Btn>
        )}
        <span style={{
          flex: 1, minWidth: 0, fontSize: 9.5, color: 'var(--gb-text-muted)',
        }}>
          {total} square image{total === 1 ? '' : 's'}
          {readyJobs.length > 0 && ` · ${readyJobs.length} ready`}
        </span>
        {!previewJob && readyJobs.length > 0 && (
          <Btn
            variant="secondary"
            size="sm"
            icon={<I.download />}
            disabled={downloadingAll}
            onClick={downloadAll}
          >
            {downloadingAll
              ? `Saving ${downloadedCount}/${readyJobs.length}…`
              : `Download all (${readyJobs.length})`}
          </Btn>
        )}
        {batch.loading ? null : active ? (
          <Btn
            variant="danger"
            size="sm"
            icon={<I.close />}
            onClick={() => onCancel(batch.batch_id)}
          >
            Cancel batch
          </Btn>
        ) : (
          <Btn
            variant="ghost"
            size="sm"
            icon={<I.trash />}
            onClick={() => onDelete(batch.batch_id)}
          >
            Delete
          </Btn>
        )}
      </ModalFooter>
    </motion.div>
  );
}

function BatchModal({
  batch, onClose, onCancel, onDelete,
}) {
  return (
    <motion.div
      key={batch.batch_id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'absolute', inset: 0, zIndex: 45, padding: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-overlay-strong)',
        backdropFilter: 'var(--gb-blur-subtle)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.955, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 9 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: 'min(1000px, 100%)', height: 'min(680px, 100%)',
          minHeight: 0, display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)',
          boxShadow: 'var(--gb-shadow-modal)',
        }}
      >
        <BatchView
          batch={batch}
          onBack={onClose}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </motion.div>
    </motion.div>
  );
}

export function MockupStudio({ initialBatchId = '', onClose, bindClose }) {
  const toast = useToast();
  const initialBatchIdRef = useRef(
    normalizeProductGenerationBatchId(initialBatchId),
  );
  const [visible, setVisible] = useState(true);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [studio, setStudio] = useState(null);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selections, setSelections] = useState({});
  const [focusedProductId, setFocusedProductId] = useState('');
  const [query, setQuery] = useState('');
  const [logo, setLogo] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState(
    initialBatchIdRef.current || null,
  );
  const [batchOpenBusy, setBatchOpenBusy] = useState(
    Boolean(initialBatchIdRef.current),
  );
  // Admin build only: the lazily-loaded catalog authoring sub-modal.
  const [CatalogAdmin, setCatalogAdmin] = useState(null);
  const [catalogAdminOpen, setCatalogAdminOpen] = useState(false);
  const loadingRef = useRef(false);
  const logoInputRef = useRef(null);
  const trayRef = useRef(null);
  const trayButtonRef = useRef(null);
  const closeRequestedRef = useRef(false);
  const batchesRef = useRef([]);
  const openBatchRequestRef = useRef(0);
  const initialBatchHandledRef = useRef(false);

  const closeCurrentBatch = useCallback(() => {
    openBatchRequestRef.current += 1;
    setBatchOpenBusy(false);
    setCurrentBatchId(null);
  }, []);

  const requestClose = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setTrayOpen(false);
    closeCurrentBatch();
    setVisible(false);
  }, [closeCurrentBatch]);

  useEffect(() => {
    bindClose?.(requestClose);
  }, [bindClose, requestClose]);

  useEffect(() => { ensureStyles(); }, []);

  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);

  useEffect(() => {
    if (!trayOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (
        trayRef.current?.contains(event.target)
        || trayButtonRef.current?.contains(event.target)
      ) return;
      setTrayOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    };
  }, [trayOpen]);

  const openBatchById = useCallback(async (value) => {
    const batchId = normalizeProductGenerationBatchId(value);
    if (!batchId) return false;
    const request = ++openBatchRequestRef.current;
    const known = batchesRef.current.some(
      (batch) => batch?.batch_id === batchId,
    );
    setTrayOpen(false);
    setCurrentBatchId(batchId);
    setBatchOpenBusy(!known);
    try {
      const batch = await getProductGenerationBatch(batchId);
      if (request !== openBatchRequestRef.current) return false;
      setBatches((rows) => mergeProductGenerationBatch(rows, batch));
      setBatchOpenBusy(false);
      setCurrentBatchId(batchId);
      return true;
    } catch (openError) {
      if (request !== openBatchRequestRef.current) return false;
      setBatchOpenBusy(false);
      const durableSnapshot = batchesRef.current.some(
        (batch) => batch?.batch_id === batchId,
      );
      if (!known && !durableSnapshot) {
        setCurrentBatchId(null);
        toast?.error?.(
          openError?.status === 404
            ? 'That mockup batch is no longer available'
            : 'Unable to open that mockup gallery',
        );
      }
      return false;
    }
  }, [toast]);

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
      setState('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Product Mockup Studio is unavailable');
      setState('error');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (
      state === 'loading'
      || initialBatchHandledRef.current
      || !initialBatchIdRef.current
    ) return;
    initialBatchHandledRef.current = true;
    void openBatchById(initialBatchIdRef.current);
  }, [openBatchById, state]);

  useEffect(() => {
    const handleOpenBatch = (event) => {
      void openBatchById(event?.detail?.batchId);
    };
    window.addEventListener(
      PRODUCT_GENERATION_OPEN_BATCH_EVENT,
      handleOpenBatch,
    );
    return () => {
      window.removeEventListener(
        PRODUCT_GENERATION_OPEN_BATCH_EVENT,
        handleOpenBatch,
      );
    };
  }, [openBatchById]);

  // Admin build only: fetch the authoring sub-modal on first use, so opening
  // the studio never pays for code most sessions will not touch.
  const openCatalogAdmin = useCallback(async () => {
    if (!__ADMIN__) return;
    setCatalogAdminOpen(true);
    if (CatalogAdmin) return;
    try {
      const component = await LOAD_CATALOG_ADMIN();
      // Wrap: setState treats a bare function argument as an updater.
      setCatalogAdmin(() => component);
    } catch {
      setCatalogAdminOpen(false);
      toast?.error?.('Catalog authoring is unavailable');
    }
  }, [CatalogAdmin, toast]);

  const hasActive = batches.some(isActiveProductGenerationBatch);
  useEffect(() => {
    if (!hasActive) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await listProductGenerationBatches();
        if (!cancelled) {
          setBatches((rows) => {
            const selected = rows.find(
              (batch) => batch?.batch_id === currentBatchId,
            );
            const selectedIsListed = next.some(
              (batch) => batch?.batch_id === currentBatchId,
            );
            return selected && !selectedIsListed
              ? mergeProductGenerationBatch(next, selected)
              : next;
          });
        }
      } catch { /* retain the last durable snapshot during a transient outage */ }
    };
    const timer = setInterval(poll, 2_500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [currentBatchId, hasActive]);

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

  const currentBatch = batches.find(
    (batch) => batch.batch_id === currentBatchId,
  ) || (currentBatchId && batchOpenBusy ? {
    batch_id: currentBatchId,
    loading: true,
    name: 'Opening mockup gallery',
    status: 'running',
    status_message: 'Loading the latest batch details',
    progress: {
      queued: 0, running: 0, completed: 0, failed: 0,
      cancelled: 0, processed: 0, total: 0, percent: 0,
    },
    jobs: [],
  } : null);
  const maxProducts = studio?.constraints?.max_products || 5;
  const maxImages = studio?.constraints?.max_images || 20;
  const selected = products.filter((product) => selectedIds.includes(product.id));
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => [
      product.title, product.brand, product.category, product.description,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [products, query]);
  const focusedProduct = products.find((product) => product.id === focusedProductId)
    || selected.at(-1)
    || null;
  const focusedSelection = focusedProduct
    ? selections[focusedProduct.id] || { sourceIds: [], variationIds: [] }
    : { sourceIds: [], variationIds: [] };
  const previewSource = focusedProduct?.sources?.find((option) => (
    focusedSelection.sourceIds.includes(option.id)
  )) || focusedProduct?.sources?.find((option) => (
    focusedProduct.option_groups?.every(
      (group) => option.option_values?.[group.id]
        === focusedSelection.optionValues?.[group.id],
    )
  ));
  const imageCount = selectedIds.reduce((total, productId) => {
    const selection = selections[productId];
    return total + (
      (selection?.sourceIds?.length || 0) * (selection?.variationIds?.length || 0)
    );
  }, 0);

  const toggleProduct = (productId) => {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    if (selectedIds.includes(productId)) {
      const remaining = selectedIds.filter((id) => id !== productId);
      setSelectedIds(remaining);
      setSelections((rows) => {
        const next = { ...rows };
        delete next[productId];
        return next;
      });
      setFocusedProductId((value) => (value === productId
        ? remaining.at(-1) || ''
        : value));
      return;
    }
    if (selectedIds.length >= maxProducts) return;
    setSelectedIds([...selectedIds, productId]);
    setSelections((rows) => ({
      ...rows,
      [productId]: createDefaultProductGenerationSelection(product),
    }));
    setFocusedProductId(productId);
  };

  const toggleOption = (productId, key, optionId) => {
    setSelections((rows) => {
      const current = rows[productId] || { sourceIds: [], variationIds: [] };
      const values = current[key] || [];
      const nextValues = values.includes(optionId)
        ? values.length > 1 ? values.filter((id) => id !== optionId) : values
        : [...values, optionId];
      return {
        ...rows,
        [productId]: { ...current, [key]: nextValues },
      };
    });
  };

  const selectFacet = (product, groupId, optionId) => {
    setSelections((rows) => {
      const current = rows[product.id] || {
        sourceIds: [], variationIds: [], optionValues: {},
      };
      const next = updateProductGenerationFacetSelection({
        product, selection: current, groupId, optionId,
      });
      if (!next) return rows;
      return {
        ...rows,
        [product.id]: next,
      };
    });
  };

  const removeFacetedSource = (productId, sourceId) => {
    setSelections((rows) => {
      const current = rows[productId];
      if (!current) return rows;
      return {
        ...rows,
        [productId]: {
          ...current,
          sourceIds: (current.sourceIds || []).filter((id) => id !== sourceId),
        },
      };
    });
  };

  const chooseLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      setLogo(await prepareProductGenerationLogo(file));
    } catch (logoError) {
      toast.error(logoError?.message || 'Unable to read that logo');
      if (logoInputRef.current) logoInputRef.current.value = '';
    } finally {
      setLogoBusy(false);
    }
  };

  const clearLogo = () => {
    setLogo(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const createBatch = async () => {
    if (!studio || !selectedIds.length || !logo) return;
    const name = selected.length === 1
      ? `${selected[0].title} mockups`
      : `Mockup batch · ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    try {
      const batch = await createProductGenerationBatch({
        studio,
        products,
        requestId: createProductGenerationRequestId(),
        name,
        selections: selectedIds.map((productId) => ({
          productId,
          ...selections[productId],
        })),
        logo,
      });
      setBatches((rows) => [
        batch, ...rows.filter((row) => row.batch_id !== batch.batch_id),
      ]);
      setSelectedIds([]);
      setSelections({});
      setFocusedProductId('');
      setQuery('');
      clearLogo();
      setCurrentBatchId(batch.batch_id);
      setBatchOpenBusy(false);
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
      if (currentBatchId === batchId) closeCurrentBatch();
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Unable to delete the batch');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: visible ? 0.2 : 0.18 }}
      onAnimationComplete={() => {
        if (!visible && closeRequestedRef.current) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999990, padding: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-overlay-strong)',
        backdropFilter: 'var(--gb-blur-subtle)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.965, y: 10 }}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : 0.972,
          y: visible ? 0 : 10,
        }}
        transition={{
          duration: visible ? 0.28 : 0.2,
          ease: visible ? [0.22, 1, 0.36, 1] : [0.4, 0, 1, 1],
        }}
        style={{
          width: 'min(1140px, 100%)', height: 'min(780px, 100%)',
          position: 'relative', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', color: 'var(--gb-text-secondary)',
          fontFamily: 'var(--gb-font-sans)',
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)',
          boxShadow: 'var(--gb-shadow-modal)',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ModalHeader
            icon={<Camera />}
            title="Product Mockup Studio"
            subtitle={`Config-driven product mockups · ${products.length} products available`}
            right={(
              <span ref={trayButtonRef} style={{ display: 'inline-flex' }}>
                <Btn
                  size="sm"
                  variant={trayOpen ? 'tinted' : 'secondary'}
                  icon={<Stack />}
                  badge={batches.length || null}
                  badgePulse={hasActive}
                  onClick={() => setTrayOpen((value) => !value)}
                >
                  Batches
                </Btn>
              </span>
            )}
            onClose={requestClose}
          />
          <AnimatePresence>
            {trayOpen && (
              <BatchTray
                batches={batches}
                onOpen={(batchId) => {
                  openBatchRequestRef.current += 1;
                  setBatchOpenBusy(false);
                  setCurrentBatchId(batchId);
                  setTrayOpen(false);
                }}
                onCancel={cancelBatch}
                onDelete={deleteBatch}
                onClose={() => setTrayOpen(false)}
                panelRef={trayRef}
              />
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {state === 'loading' ? (
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
              <TopLogoBar
                logo={logo}
                busy={logoBusy}
                inputRef={logoInputRef}
                onChoose={chooseLogo}
                onClear={clearLogo}
              />
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <div style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                  borderRight: logo ? '1px solid var(--gb-border-subtle)' : 0,
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
                    {__ADMIN__ && (
                      <IconBtn
                        size="sm"
                        variant="ghost"
                        title="Add a product workflow to the mockup catalog"
                        icon={<I.plus />}
                        onClick={openCatalogAdmin}
                      />
                    )}
                  </div>
                  <div className="gb-ms-scroll" style={{
                    flex: 1, minHeight: 0, overflowY: 'auto', padding: 12,
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
                          product, its source photos, and imprint variations to
                          the image-generation YAML—no extension rebuild required.
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
                      // Until a logo is uploaded the whole list is inert and
                      // greyed; a click on a greyed row opens the logo picker
                      // rather than doing nothing, so it reads as the next step.
                      const locked = !logo;
                      const capped = !selectedProduct && selectedIds.length >= maxProducts;
                      const disabled = locked || capped;
                      return (
                        <motion.button
                          type="button"
                          key={product.id}
                          whileTap={disabled ? undefined : { scale: 0.992 }}
                          onClick={() => {
                            if (locked) { logoInputRef.current?.click(); return; }
                            if (capped) return;
                            if (selectedProduct) setFocusedProductId(product.id);
                            else toggleProduct(product.id);
                          }}
                          aria-disabled={disabled}
                          title={locked ? 'Add the customer logo first' : undefined}
                          style={{
                            width: '100%', minHeight: 72, marginBottom: 8,
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: 10, textAlign: 'left', fontFamily: 'inherit',
                            cursor: locked ? 'pointer' : capped ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.55 : 1,
                            filter: locked ? 'grayscale(0.85)' : 'none',
                            color: 'inherit',
                            borderRadius: 'var(--gb-r-md)',
                            background: selectedProduct
                              ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                            border: `1px solid ${selectedProduct
                              ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                          }}
                        >
                          <div style={{
                            width: 52, height: 52, flexShrink: 0,
                            borderRadius: 'var(--gb-r-md)',
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
                          <span
                            role="button"
                            tabIndex={selectedProduct ? 0 : -1}
                            onClick={(event) => {
                              if (!selectedProduct) return;
                              event.stopPropagation();
                              toggleProduct(product.id);
                            }}
                            onKeyDown={(event) => {
                              if (!selectedProduct) return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleProduct(product.id);
                              }
                            }}
                            style={{
                            width: 22, height: 22, flexShrink: 0, marginRight: 5,
                            borderRadius: 'var(--gb-r-sm)',
                            // The box is shorter than the row, so it already has
                            // ~15px of vertical breathing room; matching that on
                            // the right stops it reading as jammed to the edge.
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: selectedProduct
                              ? 'var(--gb-brand-label)' : 'var(--gb-fill-subtle)',
                            border: `1px solid ${selectedProduct
                              ? 'var(--gb-brand-border)' : 'var(--gb-border-default)'}`,
                            color: selectedProduct
                              ? 'var(--gb-text-on-brand)' : 'var(--gb-text-ghost)',
                            cursor: selectedProduct ? 'pointer' : 'inherit',
                          }}
                          >
                            {selectedProduct ? <I.close size={9} /> : <I.plus size={11} />}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div style={{
                  width: 370, flexShrink: 0, minHeight: 0,
                  display: logo ? 'flex' : 'none', flexDirection: 'column',
                  background: 'var(--gb-surface-canvas)',
                }}>
                  <div style={{
                    padding: '11px 16px 12px',
                    borderBottom: '1px solid var(--gb-border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <div style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
                        textTransform: 'uppercase', color: 'var(--gb-text-muted)',
                      }}>
                        Product reference
                      </div>
                      {focusedProduct && (
                        <span style={{
                          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', fontSize: 9.5,
                          color: 'var(--gb-brand-label)',
                        }}>
                          {focusedProduct.title}
                        </span>
                      )}
                    </div>
                    {/* Sized to leave the option groups below enough room to
                        sit without a scrollbar; the reference is orientation
                        context, not the subject. */}
                    <div style={{
                      position: 'relative', width: '100%',
                      aspectRatio: '16 / 9',
                      maxHeight: 118, overflow: 'hidden', margin: '0 auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--gb-r-md)',
                      background: 'var(--gb-fill-soft)',
                      border: '1px solid var(--gb-border-default)',
                    }}>
                      {previewSource?.thumbnail_url || focusedProduct?.thumbnail_url ? (
                        <img
                          src={previewSource?.thumbnail_url || focusedProduct?.thumbnail_url}
                          alt=""
                          style={{
                            width: '100%', height: '100%', objectFit: 'contain',
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
                            Select a product
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="gb-ms-scroll" style={{
                    flex: 1, minHeight: 0, overflowY: 'auto',
                    padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
                  }}>
                    {focusedProduct ? (
                      focusedProduct.option_groups?.length ? (
                        <>
                          {focusedProduct.option_groups.map((group) => (
                            <FacetGrid
                              key={group.id}
                              group={group}
                              product={focusedProduct}
                              selection={focusedSelection}
                              onChange={(groupId, optionId) => selectFacet(
                                focusedProduct, groupId, optionId,
                              )}
                            />
                          ))}
                          <div style={{
                            padding: '10px 11px', borderRadius: 'var(--gb-r-md)',
                            background: 'var(--gb-success-tint-medium)',
                            border: '1px solid var(--gb-success-tint-border)',
                            color: 'var(--gb-success-fg)', fontSize: 9.5,
                            lineHeight: 1.45,
                          }}>
                            Choose the scene, then select every color you want.
                            Each selected combination becomes its own square
                            image and appears as a detailed tag below.
                          </div>
                        </>
                      ) : (
                        <>
                          <ReferenceGrid
                            label="Product sources"
                            helper="Choose the product colors or reference photos to mock up."
                            options={focusedProduct.sources || []}
                            values={focusedSelection.sourceIds}
                            onToggle={(optionId) => toggleOption(
                              focusedProduct.id, 'sourceIds', optionId,
                            )}
                          />
                          <ReferenceGrid
                            label="Imprint variations"
                            helper="Choose where the uploaded logo should be applied."
                            options={focusedProduct.variations || []}
                            values={focusedSelection.variationIds}
                            onToggle={(optionId) => toggleOption(
                              focusedProduct.id, 'variationIds', optionId,
                            )}
                          />
                        </>
                      )
                    ) : (
                      <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        borderRadius: 'var(--gb-r-md)',
                        background: 'var(--gb-fill-subtle)',
                        border: '1px dashed var(--gb-border-default)',
                        color: 'var(--gb-text-muted)', fontSize: 10.5,
                        lineHeight: 1.55,
                      }}>
                        Select a product to choose its YAML-configured options
                        and reference image.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center',
                gap: 10, background: 'var(--gb-fill-inverse-strong)',
                borderTop: '1px solid var(--gb-border-subtle)',
                visibility: logo ? 'visible' : 'hidden',
                height: logo ? 'auto' : 0,
                paddingTop: logo ? 10 : 0,
                paddingBottom: logo ? 10 : 0,
                overflow: 'hidden',
              }}>
                <div style={{
                  flex: 1, minWidth: 0, display: 'flex',
                  alignItems: 'center', gap: 6,
                  overflow: 'hidden',
                }}>
                  {selected.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--gb-text-muted)' }}>
                      Pick up to {maxProducts} products to render mockups for
                    </span>
                  ) : selected.map((product) => {
                    const selection = selections[product.id] || {};
                    if (product.option_groups?.length) {
                      return (
                        <FacetedSelectionTags
                          key={product.id}
                          product={product}
                          selection={selection}
                          onRemoveProduct={() => toggleProduct(product.id)}
                          onRemoveSource={(sourceId) => removeFacetedSource(
                            product.id, sourceId,
                          )}
                        />
                      );
                    }
                    return (
                      <React.Fragment key={product.id}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          flex: '1 1 110px', minWidth: 32, maxWidth: 150,
                          padding: '4px 7px', overflow: 'hidden',
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
                              display: 'flex', flexShrink: 0, padding: 0, border: 0,
                              background: 'transparent', color: 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            <I.close size={9} />
                          </button>
                        </span>
                        <span style={{
                          flex: '0 1 auto', minWidth: 28, overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          padding: '4px 7px', borderRadius: 'var(--gb-r-pill)',
                          background: 'var(--gb-info-tint-medium)',
                          border: '1px solid var(--gb-info-tint-border)',
                          color: 'var(--gb-info-fg)', fontSize: 9.5, fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}>
                          {selection.sourceIds?.length || 0} source{selection.sourceIds?.length === 1 ? '' : 's'}
                        </span>
                        <span style={{
                          flex: '0 1 auto', minWidth: 28, overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          padding: '4px 7px', borderRadius: 'var(--gb-r-pill)',
                          background: 'var(--gb-warning-tint-medium)',
                          border: '1px solid var(--gb-warning-tint-border)',
                          color: 'var(--gb-warning-fg)', fontSize: 9.5, fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}>
                          {selection.variationIds?.length || 0} placement{selection.variationIds?.length === 1 ? '' : 's'}
                        </span>
                      </React.Fragment>
                    );
                  })}
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
                  disabled={
                    selected.length === 0 || !logo || logoBusy
                    || imageCount < 1 || imageCount > maxImages
                  }
                  onClick={createBatch}
                >
                  Generate mockups
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {currentBatch && (
            <BatchModal
              batch={currentBatch}
              onClose={closeCurrentBatch}
              onCancel={cancelBatch}
              onDelete={deleteBatch}
            />
          )}
        </AnimatePresence>
        {__ADMIN__ && (
          <AnimatePresence>
            {catalogAdminOpen && CatalogAdmin && (
              <CatalogAdmin
                onClose={() => setCatalogAdminOpen(false)}
                onSaved={load}
              />
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}
