/**
 * Mockup catalog authoring — admin-only sub-modal of the Product Mockup Studio.
 *
 * Turns a corporate-catalog product into a managed mockup workflow without
 * hand-editing YAML. Pick a custom-logo product, choose which of its catalog
 * facets (colour, size…) become selectable axes, add any authored axis (scene,
 * angle…), then drop a reference photo into each combination cell. The draft is
 * validated locally, saved through the backend's own loader, and written to
 * api-access-configs/golfballs-image-generation.yaml — which the studio re-reads
 * on every request, so a save is live immediately.
 *
 * The combination grid is SPARSE on purpose: a cell with no photo simply is not
 * a source. The shipped towel is exactly this (11 sources across a 2x6 grid).
 *
 * This module is only ever reached through an `__ADMIN__` branch, so the served
 * consumer build never bundles it.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Btn, IconBtn, Input, Textarea, Checkbox, Switch } from '../ui/index.js';
import { I } from '../ui/icons.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { readCatalogCache, loadCatalog } from '../lib/giftCatalog.js';
import {
  MAX_OPTION_GROUPS, MAX_SOURCES,
  axisFromCatalogProperty, buildCatalogProduct, combinationKey, combinationsOf,
  draftFromCatalogProduct, mergeCatalogProduct, referenceNameFor, remapCells,
  toOptionId, toProductId,
} from '../lib/mockupCatalogDraft.js';
import {
  readMockupCatalog, uploadMockupReference, writeMockupCatalog,
} from '../lib/mockupCatalogClient.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SAVE_DEBOUNCE_MS = 700;
// Short envelope, same curve as the shelf's view switch — the panel change
// should read as a step forward, not as an effect.
const PANEL_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] };

const mono = 'var(--gb-font-mono)';
const cardStyle = {
  background: 'var(--gb-fill-inverse-medium)',
  border: '1px solid var(--gb-border-subtle)',
  borderRadius: 'var(--gb-r-md)',
};

/** Section header used down the setup rail — small caps, quiet, countable. */
function Rail({ title, count, action, children, collapsible = false, open, onToggle }) {
  const expanded = collapsible ? open : true;
  return (
    <div style={{ borderBottom: '1px solid var(--gb-border-subtle)' }}>
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        style={{
          width: '100%', padding: '9px 12px', border: 0, background: 'transparent',
          display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left',
          cursor: collapsible ? 'pointer' : 'default', color: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {collapsible && (
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.16 }}
            style={{ display: 'flex', color: 'var(--gb-text-tertiary)' }}
          >
            <I.chevr size={11} />
          </motion.span>
        )}
        <span style={{
          flex: 1, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--gb-text-tertiary)',
        }}>
          {title}
        </span>
        {count != null && (
          <span style={{ fontSize: 9.5, fontFamily: mono, color: 'var(--gb-text-muted)' }}>
            {count}
          </span>
        )}
        {action}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 11px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── stage 1 — pick a product ─────────────────────────────────────────── */

function ProductPicker({ rows, query, onQuery, onPick, loading, onRefresh }) {
  return (
    <>
      <div style={{
        padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-fill-inverse-medium)',
      }}>
        <Input
          size="md"
          value={query}
          onChange={onQuery}
          placeholder="Search custom-logo products by name, SKU, or brand…"
          leading={<I.search size={13} />}
          trailing={query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              style={{
                display: 'flex', padding: 0, cursor: 'pointer', border: 0,
                background: 'transparent', color: 'var(--gb-text-muted)',
              }}
            >
              <I.close size={12} />
            </button>
          ) : null}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10.5, fontFamily: mono, color: 'var(--gb-text-muted)' }}>
          {rows.length}
        </span>
        <IconBtn
          size="sm" variant="ghost" title="Re-index catalog"
          icon={<I.refresh />} onClick={onRefresh}
        />
      </div>
      <div className="gb-ms-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && !rows.length ? (
          <div style={{
            padding: 40, textAlign: 'center', fontSize: 12,
            color: 'var(--gb-text-muted)',
          }}>
            Loading the corporate catalog…
          </div>
        ) : !rows.length ? (
          <div style={{
            padding: 40, textAlign: 'center', fontSize: 12,
            color: 'var(--gb-text-muted)',
          }}>
            No custom-logo products match that search.
          </div>
        ) : (
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 11.5,
          }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, zIndex: 1,
                background: 'var(--gb-surface-float)',
                boxShadow: '0 1px 0 var(--gb-border-subtle)',
              }}>
                {['', 'Product', 'SKU', 'Category', 'Variations', ''].map((label, index) => (
                  <th
                    key={label + index}
                    style={{
                      padding: '7px 10px', textAlign: index === 4 ? 'right' : 'left',
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
                      textTransform: 'uppercase', color: 'var(--gb-text-tertiary)',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onPick(row)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--gb-border-subtle)',
                    background: row.configured ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--gb-fill-soft)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = row.configured
                      ? 'var(--gb-brand-tint-soft)' : 'transparent';
                  }}
                >
                  <td style={{ padding: '6px 10px', width: 42 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 'var(--gb-r-sm)',
                      overflow: 'hidden', background: 'var(--gb-fill-soft)',
                      border: '1px solid var(--gb-border-subtle)',
                    }}>
                      {row.img && (
                        <img
                          src={row.img} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '6px 10px', minWidth: 0 }}>
                    <div style={{
                      fontWeight: 650, color: 'var(--gb-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 330,
                    }}>
                      {row.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>
                      {row.brand}
                    </div>
                  </td>
                  <td style={{
                    padding: '6px 10px', fontFamily: mono, fontSize: 10,
                    color: 'var(--gb-text-muted)',
                  }}>
                    {row.sku}
                  </td>
                  <td style={{ padding: '6px 10px', color: 'var(--gb-text-muted)' }}>
                    {row.cat}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    {row.axes.length ? (
                      <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>
                        {row.axes.map((axis) => (
                          `${axis.label} ${axis.options.length}`
                        )).join(' · ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--gb-text-tertiary)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', width: 92, textAlign: 'right' }}>
                    {row.configured ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        height: 18, padding: '0 6px', borderRadius: 'var(--gb-r-pill)',
                        background: 'var(--gb-brand-tint-medium)',
                        color: 'var(--gb-brand-label)',
                        border: '1px solid var(--gb-brand-tint-border)',
                        fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em',
                      }}>
                        <I.check size={9} /> CONFIGURED
                      </span>
                    ) : (
                      <I.chevr size={12} style={{ color: 'var(--gb-text-tertiary)' }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── stage 2 — the reference matrix ───────────────────────────────────── */

/** One combination cell: thumbnail, drop target, and its prompt indicator. */
function MatrixCell({ cell, label, busy, selected, onSelect, onDrop }) {
  const [over, setOver] = useState(false);
  const filled = !!cell?.referenceUrl;
  return (
    <button
      type="button"
      onClick={onSelect}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer?.files?.[0];
        if (file) onDrop(file);
      }}
      title={label}
      style={{
        position: 'relative', width: '100%', aspectRatio: '1 / 1',
        padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        borderRadius: 'var(--gb-r-sm)', overflow: 'hidden',
        background: filled ? 'var(--gb-fill-soft)' : 'var(--gb-fill-inverse-medium)',
        border: `1px ${filled ? 'solid' : 'dashed'} ${
          selected ? 'var(--gb-brand-label)'
            : over ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'
        }`,
        boxShadow: selected ? '0 0 0 2px var(--gb-brand-tint-medium)' : 'none',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      {filled ? (
        <img
          src={cell.referenceUrl} alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: over ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
        }}>
          <I.plus size={13} />
        </span>
      )}
      {busy && (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--gb-backdrop) 62%, transparent)',
        }}>
          <span style={{
            width: 13, height: 13, borderRadius: '50%',
            border: '2px solid var(--gb-brand-tint-border)',
            borderTopColor: 'var(--gb-brand-label)',
            animation: 'gb-ms-spin .7s linear infinite',
          }} />
        </span>
      )}
      {cell?.prompt && (
        <span
          title="Has a per-reference prompt"
          style={{
            position: 'absolute', right: 3, bottom: 3, width: 5, height: 5,
            borderRadius: '50%', background: 'var(--gb-brand-label)',
          }}
        />
      )}
    </button>
  );
}

/** Rows x columns when there are exactly two axes; a flat wrap otherwise. */
function ReferenceMatrix({ axes, cells, busyKeys, selectedKey, onSelect, onDropFile }) {
  const combos = useMemo(() => combinationsOf(axes), [axes]);
  if (!combos.length) {
    return (
      <div style={{
        padding: 34, textAlign: 'center', fontSize: 11.5,
        color: 'var(--gb-text-muted)',
      }}>
        Turn on at least one variation axis to build the reference grid.
      </div>
    );
  }
  const cellFor = (combo) => {
    const key = combinationKey(combo);
    return (
      <MatrixCell
        key={key}
        cell={cells[key]}
        label={key}
        busy={busyKeys.has(key)}
        selected={selectedKey === key}
        onSelect={() => onSelect(key, combo)}
        onDrop={(file) => onDropFile(key, combo, file)}
      />
    );
  };

  if (axes.length === 2) {
    const [rowAxis, colAxis] = axes;
    return (
      <div style={{ padding: '4px 2px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `76px repeat(${colAxis.options.length}, minmax(0, 1fr))`,
          gap: 5, alignItems: 'center',
        }}>
          <span />
          {colAxis.options.map((option) => (
            <span
              key={option.id}
              title={option.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 9, fontWeight: 700, color: 'var(--gb-text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {option.swatch && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: option.swatch,
                  border: '1px solid var(--gb-border-default)',
                }} />
              )}
              {option.label}
            </span>
          ))}
          {rowAxis.options.map((rowOption) => (
            <React.Fragment key={rowOption.id}>
              <span
                title={rowOption.label}
                style={{
                  fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  paddingRight: 4, textAlign: 'right',
                }}
              >
                {rowOption.label}
              </span>
              {colAxis.options.map((colOption) => cellFor([
                { axis: rowAxis.id, option: rowOption.id },
                { axis: colAxis.id, option: colOption.id },
              ]))}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '6px 2px', display: 'grid', gap: 6,
      gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
    }}>
      {combos.map((combo) => (
        <div key={combinationKey(combo)}>
          {cellFor(combo)}
          <div style={{
            marginTop: 3, fontSize: 8.5, textAlign: 'center',
            color: 'var(--gb-text-tertiary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {combinationKey(combo)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inspector for the selected cell — link, upload, per-reference prompt. */
function CellInspector({ combinationKey: key, cell, onChange, onUpload, busy }) {
  const inputRef = useRef(null);
  if (!key) {
    return (
      <div style={{
        padding: '10px 12px', fontSize: 11, color: 'var(--gb-text-tertiary)',
      }}>
        Select a cell to attach its reference photo and prompt.
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{
          fontSize: 10, fontFamily: mono, fontWeight: 700,
          color: 'var(--gb-brand-label)',
        }}>
          {key}
        </span>
        <span style={{ flex: 1 }} />
        <Btn
          size="sm" variant="secondary" disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {cell?.referenceUrl ? 'Replace' : 'Upload'}
        </Btn>
        {cell?.referenceUrl && (
          <IconBtn
            size="sm" variant="ghost" title="Clear this reference"
            icon={<I.trash />}
            onClick={() => onChange({ referenceUrl: '', thumbnailUrl: '' })}
          />
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onUpload(file);
        }}
      />
      <Input
        size="sm"
        value={cell?.referenceUrl || ''}
        onChange={(value) => onChange({ referenceUrl: value })}
        placeholder="https://…/reference.png — or drop an image on the cell"
      />
      <Textarea
        value={cell?.prompt || ''}
        onChange={(value) => onChange({ prompt: value })}
        placeholder="Optional per-reference prompt (e.g. preserve this exact fabric colour)"
        rows={2}
      />
    </div>
  );
}

/* ── the modal ────────────────────────────────────────────────────────── */

export function MockupCatalogAdmin({ onClose, onSaved }) {
  const toast = useToast();
  const [stage, setStage] = useState('picker');
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [managed, setManaged] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [openOptionKey, setOpenOptionKey] = useState({ axis: '', option: '' });
  const [busyKeys, setBusyKeys] = useState(new Set());
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [placementsOpen, setPlacementsOpen] = useState(false);
  const saveTimer = useRef(null);
  const latestDraft = useRef(null);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Corporate catalog: paint from cache instantly, refresh when stale.
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await readCatalogCache();
      if (alive && cached.products) {
        setCatalog(cached.products);
        setCatalogLoading(false);
      }
      if (!cached.products || cached.stale) {
        try {
          const fresh = await loadCatalog();
          if (alive) setCatalog(fresh);
        } catch { /* the cache, if any, still stands */ }
      }
      if (alive) setCatalogLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // The managed catalog is the authoring source of truth.
  useEffect(() => {
    let alive = true;
    readMockupCatalog()
      .then((payload) => { if (alive) setManaged(payload.products || []); })
      .catch((error) => {
        if (alive) setSaveError(error?.message || 'Unable to load the mockup catalog');
      });
    return () => { alive = false; };
  }, []);

  const managedById = useMemo(
    () => new Map(managed.map((row) => [String(row?.id || ''), row])),
    [managed],
  );
  const managedBySku = useMemo(
    () => new Map(managed.filter((row) => row?.catalog_sku)
      .map((row) => [String(row.catalog_sku), row])),
    [managed],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .filter((product) => product?.customLogo)
      .map((product) => ({
        id: product.id,
        title: product.title,
        brand: product.brand,
        sku: product.sku,
        cat: product.cat,
        img: product.img,
        url: product.url,
        properties: product.properties || [],
        axes: (product.properties || [])
          .map((property) => axisFromCatalogProperty(property))
          .filter(Boolean),
        configured: managedBySku.has(String(product.sku))
          || managedById.has(toProductId(product.title)),
      }))
      .filter((row) => !needle || [row.title, row.sku, row.brand, row.cat]
        .some((field) => String(field || '').toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.configured) - Number(a.configured)
        || a.title.localeCompare(b.title, 'en'))
      .slice(0, 400);
  }, [catalog, query, managedById, managedBySku]);

  const openProduct = useCallback((row) => {
    const existing = managedBySku.get(String(row.sku))
      || managedById.get(toProductId(row.title));
    if (existing) {
      const restored = draftFromCatalogProduct(existing);
      // Offer any catalog facet the saved product does not already use.
      const known = new Set(restored.axes.map((axis) => axis.id));
      restored.axes = [
        ...restored.axes,
        ...row.axes.filter((axis) => !known.has(axis.id))
          .map((axis) => ({ ...axis, enabled: false })),
      ];
      restored.catalogSku = restored.catalogSku || row.sku;
      restored.catalogId = restored.catalogId || row.id;
      setDraft(restored);
    } else {
      setDraft({
        id: toProductId(row.title),
        title: row.title,
        brand: row.brand,
        category: row.cat,
        description: '',
        displayImageUrl: '',
        catalogSku: row.sku,
        catalogId: row.id,
        enabled: true,
        sort: 10,
        promptVersion: `${toProductId(row.title).slice(0, 60)}-v1`,
        prompt: '',
        axes: row.axes.map((axis, index) => ({ ...axis, enabled: index === 0 })),
        cells: {},
        placements: [],
      });
    }
    setSelectedKey('');
    setSaveError('');
    setSaveState('idle');
    setStage('editor');
  }, [managedById, managedBySku]);

  const activeAxes = useMemo(
    () => (draft?.axes || []).filter((axis) => axis.enabled !== false && axis.options.length),
    [draft],
  );
  const { product, issues } = useMemo(
    () => (draft ? buildCatalogProduct(draft) : { product: null, issues: [] }),
    [draft],
  );
  latestDraft.current = { product, issues };

  const persist = useCallback((nextProduct) => {
    setSaveState('saving');
    const products = mergeCatalogProduct(managed, nextProduct);
    writeMockupCatalog(products)
      .then(() => {
        setManaged(products);
        setSaveState('saved');
        setSaveError('');
        onSaved?.();
      })
      .catch((error) => {
        setSaveState('error');
        setSaveError(error?.message || 'Unable to save the mockup catalog');
      });
  }, [managed, onSaved]);

  /* Autosave every committed change, but only once the draft is actually
     valid — the studio re-reads this document on every request, so writing a
     half-built product would be visible to everyone immediately. */
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const current = latestDraft.current;
      if (!current?.product || current.issues.length) return;
      persist(current.product);
    }, SAVE_DEBOUNCE_MS);
  }, [persist]);

  const patchDraft = useCallback((patch) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
    scheduleSave();
  }, [scheduleSave]);

  const patchCell = useCallback((key, patch) => {
    setDraft((previous) => (previous ? {
      ...previous,
      cells: { ...previous.cells, [key]: { ...(previous.cells[key] || {}), ...patch } },
    } : previous));
    scheduleSave();
  }, [scheduleSave]);

  const uploadForCell = useCallback(async (key, combo, file) => {
    if (!draft) return;
    const mediaType = String(file?.type || '').toLowerCase();
    if (!IMAGE_TYPES.has(mediaType)) {
      toast?.error?.('Choose a PNG, JPEG, or WebP image');
      return;
    }
    setBusyKeys((previous) => new Set(previous).add(key));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const uploaded = await uploadMockupReference({
        productId: toProductId(draft.id || draft.title),
        name: referenceNameFor(combo),
        mediaType,
        dataBase64: btoa(binary),
      });
      patchCell(key, { referenceUrl: uploaded.url, thumbnailUrl: '' });
    } catch (error) {
      toast?.error?.(error?.message || 'Unable to upload the reference image');
    } finally {
      setBusyKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, [draft, patchCell, toast]);

  /* Every axis edit runs through here.
   *
   * A cell's identity IS its combination, so ANY change to the enabled axes or
   * their options renames the keys. remapCells carries the existing photos
   * across: adding a scene fans each photo out over the new scenes, removing an
   * axis collapses them back. Without this, adding a scene silently orphaned
   * every reference already uploaded. */
  const editAxes = useCallback((mutate) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const axes = mutate(previous.axes);
      if (!axes) return previous;
      const visible = (list) => list
        .filter((axis) => axis.enabled !== false)
        .map((axis) => ({ ...axis, options: axis.options.filter((o) => !o.hidden) }))
        .filter((axis) => axis.options.length);
      if (visible(axes).length > MAX_OPTION_GROUPS) return previous;
      return {
        ...previous,
        axes,
        cells: remapCells(previous.cells, visible(previous.axes), visible(axes)),
      };
    });
    setSelectedKey('');
    scheduleSave();
  }, [scheduleSave]);

  const toggleAxis = useCallback((axisId) => editAxes((axes) => axes.map((axis) => (
    axis.id === axisId ? { ...axis, enabled: axis.enabled === false } : axis
  ))), [editAxes]);

  const removeAxis = useCallback((axisId) => editAxes(
    (axes) => axes.filter((axis) => axis.id !== axisId),
  ), [editAxes]);

  const toggleOption = useCallback((axisId, optionId) => editAxes((axes) => axes.map(
    (axis) => (axis.id !== axisId ? axis : {
      ...axis,
      options: axis.options.map((option) => (
        option.id === optionId ? { ...option, hidden: !option.hidden } : option
      )),
    }),
  )), [editAxes]);

  const addAuthoredAxis = useCallback(() => editAxes((axes) => {
    let id = 'scene';
    let n = 2;
    while (axes.some((axis) => axis.id === id)) { id = `scene-${n}`; n += 1; }
    return [...axes, {
      id,
      label: id === 'scene' ? 'Scene' : `Scene ${n - 1}`,
      description: '',
      presentation: 'thumbnail',
      columns: 2,
      enabled: true,
      source: 'authored',
      options: [{ id: 'studio', label: 'Studio', prompt: '' }],
    }];
  }), [editAxes]);

  const addAxisOption = useCallback((axisId, label) => {
    const optionLabel = String(label || '').trim();
    if (!optionLabel) return;
    editAxes((axes) => axes.map((axis) => {
      if (axis.id !== axisId) return axis;
      const id = toOptionId(optionLabel);
      if (!id || axis.options.some((option) => option.id === id)) return axis;
      return {
        ...axis,
        options: [...axis.options, { id, label: optionLabel, prompt: '' }],
      };
    }));
  }, [editAxes]);

  /** Author an option's own prompt — the scene described once. */
  const patchOption = useCallback((axisId, optionId, patch) => {
    setDraft((previous) => (previous ? {
      ...previous,
      axes: previous.axes.map((axis) => (axis.id !== axisId ? axis : {
        ...axis,
        options: axis.options.map((option) => (
          option.id === optionId ? { ...option, ...patch } : option
        )),
      })),
    } : previous));
    scheduleSave();
  }, [scheduleSave]);

  const sourceCount = product?.sources?.length || 0;
  const overCapacity = sourceCount > MAX_SOURCES;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, zIndex: 55, padding: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--gb-backdrop) 80%, transparent)',
        backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.955, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 9 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: 'min(1160px, 100%)', height: 'min(730px, 100%)',
          minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--gb-surface-float)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl)',
          boxShadow: 'var(--gb-shadow-modal)',
        }}
      >
        <div style={{
          padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11,
          borderBottom: '1px solid var(--gb-border-subtle)',
        }}>
          {stage === 'editor' && (
            <IconBtn
              size="sm" variant="ghost" title="Back to products"
              icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
              onClick={() => { setStage('picker'); setDraft(null); }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--gb-brand-label)',
            }}>
              Mockup catalog · admin
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {stage === 'picker'
                ? 'Add a product workflow'
                : draft?.title || 'Untitled product'}
            </div>
          </div>
          {stage === 'editor' && (
            <>
              <span style={{
                fontSize: 10, fontFamily: mono,
                color: overCapacity ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)',
              }}>
                {sourceCount}/{MAX_SOURCES} refs
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 700,
                color: saveState === 'error' ? 'var(--gb-error-fg)'
                  : saveState === 'saved' ? 'var(--gb-success-fg)'
                    : 'var(--gb-text-muted)',
              }}>
                {saveState === 'saving' ? 'Saving…'
                  : saveState === 'saved' ? 'Saved'
                    : saveState === 'error' ? 'Not saved'
                      : issues.length ? 'Draft' : 'Ready'}
              </span>
            </>
          )}
          <IconBtn size="sm" variant="ghost" title="Close" icon={<I.close />} onClick={onClose} />
        </div>

        {/* Panels cross-fade with a short directional slide — forward into the
            editor, back to the picker — matching the shelf's view switch. */}
        <AnimatePresence initial={false} mode="popLayout">
        {stage === 'picker' ? (
          <motion.div
            key="picker"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={PANEL_TRANSITION}
            style={{
              flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            }}
          >
            <ProductPicker
              rows={rows}
              query={query}
              onQuery={setQuery}
              onPick={openProduct}
              loading={catalogLoading}
              onRefresh={() => {
                setCatalogLoading(true);
                loadCatalog({ force: true })
                  .then(setCatalog)
                  .catch((error) => toast?.error?.(error?.message || 'Re-index failed'))
                  .finally(() => setCatalogLoading(false));
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={PANEL_TRANSITION}
            style={{ flex: 1, minHeight: 0, display: 'flex' }}
          >
            {/* setup rail */}
            <div
              className="gb-ms-scroll"
              style={{
                width: 292, flexShrink: 0, overflowY: 'auto',
                borderRight: '1px solid var(--gb-border-subtle)',
              }}
            >
              <Rail title="Identity">
                <div style={{ display: 'grid', gap: 6 }}>
                  <Input
                    size="sm" value={draft?.title || ''}
                    onChange={(value) => patchDraft({ title: value })}
                    placeholder="Product title"
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input
                      size="sm" value={draft?.id || ''}
                      onChange={(value) => patchDraft({ id: toProductId(value, value) })}
                      placeholder="product-id"
                      style={{ flex: 1 }}
                    />
                    <Input
                      size="sm" value={draft?.promptVersion || ''}
                      onChange={(value) => patchDraft({ promptVersion: value })}
                      placeholder="prompt-v1"
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5,
                    fontFamily: mono, color: 'var(--gb-text-tertiary)',
                  }}>
                    <I.link size={10} />
                    {draft?.catalogSku || '—'}
                    <span style={{ flex: 1 }} />
                    <Switch
                      size="sm"
                      on={draft?.enabled !== false}
                      onChange={(value) => patchDraft({ enabled: value })}
                    />
                  </div>
                </div>
              </Rail>

              <Rail
                title="Colors & scenes"
                count={`${activeAxes.length}/${MAX_OPTION_GROUPS}`}
                action={(
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => { event.stopPropagation(); addAuthoredAxis(); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.stopPropagation(); addAuthoredAxis(); }
                    }}
                    title="Add a scene (on a model, flat studio…)"
                    style={{
                      display: 'flex', alignItems: 'center',
                      color: 'var(--gb-brand-label)', cursor: 'pointer',
                    }}
                  >
                    <I.plus size={12} />
                  </span>
                )}
              >
                <div style={{ display: 'grid', gap: 7 }}>
                  <div style={{
                    fontSize: 9.5, lineHeight: 1.5, color: 'var(--gb-text-tertiary)',
                  }}>
                    Each option’s prompt is written once and applies everywhere it
                    is selected. Adding a scene repeats the colors within it.
                  </div>
                  {!draft?.axes?.length && (
                    <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>
                      This product publishes no catalog colors. Add a scene to
                      start the grid.
                    </div>
                  )}
                  {(draft?.axes || []).map((axis) => (
                    <AxisCard
                      key={axis.id}
                      axis={axis}
                      openOptionId={openOptionKey.axis === axis.id ? openOptionKey.option : ''}
                      onToggleAxis={() => toggleAxis(axis.id)}
                      onRemoveAxis={() => removeAxis(axis.id)}
                      onToggleOption={(optionId) => toggleOption(axis.id, optionId)}
                      onOpenOption={(optionId) => setOpenOptionKey(
                        (previous) => (previous.axis === axis.id && previous.option === optionId
                          ? { axis: '', option: '' }
                          : { axis: axis.id, option: optionId }),
                      )}
                      onPatchOption={(optionId, patch) => patchOption(axis.id, optionId, patch)}
                      onAddOption={(label) => addAxisOption(axis.id, label)}
                    />
                  ))}
                </div>
              </Rail>

              <Rail
                title="Placements"
                count={(draft?.placements?.length || 0) || 1}
                collapsible
                open={placementsOpen}
                onToggle={() => setPlacementsOpen((value) => !value)}
              >
                <PlacementsEditor
                  placements={draft?.placements || []}
                  onChange={(placements) => patchDraft({ placements })}
                />
              </Rail>
            </div>

            {/* grid + prompt */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                className="gb-ms-scroll"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}
              >
                <ReferenceMatrix
                  axes={activeAxes.map((axis) => ({
                    ...axis,
                    options: axis.options.filter((option) => !option.hidden),
                  }))}
                  cells={draft?.cells || {}}
                  busyKeys={busyKeys}
                  selectedKey={selectedKey}
                  onSelect={(key) => setSelectedKey(key)}
                  onDropFile={uploadForCell}
                />
              </div>
              <div style={{ borderTop: '1px solid var(--gb-border-subtle)' }}>
                <CellInspector
                  combinationKey={selectedKey}
                  cell={draft?.cells?.[selectedKey]}
                  busy={busyKeys.has(selectedKey)}
                  onChange={(patch) => patchCell(selectedKey, patch)}
                  onUpload={(file) => {
                    const combo = combinationsOf(activeAxes)
                      .find((entry) => combinationKey(entry) === selectedKey);
                    if (combo) uploadForCell(selectedKey, combo, file);
                  }}
                />
              </div>
              <div style={{
                borderTop: '1px solid var(--gb-border-subtle)', padding: '9px 12px 10px',
              }}>
                <div style={{
                  marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
                  textTransform: 'uppercase', color: 'var(--gb-text-tertiary)',
                }}>
                  Product prompt
                  <span style={{
                    letterSpacing: 0, textTransform: 'none', fontWeight: 500,
                    fontSize: 9.5, color: 'var(--gb-text-ghost)',
                  }}>
                    applies to every scene, color, and placement
                  </span>
                </div>
                <Textarea
                  value={draft?.prompt || ''}
                  onChange={(value) => patchDraft({ prompt: value })}
                  placeholder="How the logo is applied to this product, and what must be preserved from the reference photo. Leave scene, color, and placement detail to their own prompts."
                  rows={3}
                />
              </div>
              {(issues.length > 0 || saveError) && (
                <div style={{
                  padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6,
                  borderTop: '1px solid var(--gb-border-subtle)',
                  background: 'var(--gb-error-tint-soft)',
                }}>
                  {(saveError ? [saveError] : issues).slice(0, 4).map((issue) => (
                    <span key={issue} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, color: 'var(--gb-error-fg)',
                    }}>
                      <I.alert size={11} />{issue}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/**
 * One variation axis: enable it, delete it, and author each option's prompt.
 *
 * Clicking an option opens its prompt box — that prompt is written ONCE here
 * and composes into every reference that selects the option, which is what
 * stops a scene from being retyped in each colour cell. The checkbox toggles
 * whether the option participates in the grid at all.
 */
function AxisCard({
  axis, openOptionId, onToggleAxis, onRemoveAxis, onToggleOption,
  onOpenOption, onPatchOption, onAddOption,
}) {
  const on = axis.enabled !== false;
  const authored = axis.source !== 'catalog';
  const prompted = axis.options.filter((option) => String(option.prompt || '').trim()).length;
  return (
    <div style={{ ...cardStyle, padding: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Checkbox checked={on} onChange={onToggleAxis} />
        <span style={{
          flex: 1, minWidth: 0, fontSize: 11, fontWeight: 650,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: on ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
        }}>
          {axis.label}
        </span>
        <span
          title={prompted ? `${prompted} option prompt${prompted === 1 ? '' : 's'}` : undefined}
          style={{ fontSize: 9, fontFamily: mono, color: 'var(--gb-text-tertiary)' }}
        >
          {authored ? 'authored' : 'catalog'}
          {' · '}
          {axis.options.length}
          {prompted > 0 && ` · ${prompted}✎`}
        </span>
        <IconBtn
          size="sm" variant="ghost" title={`Remove the ${axis.label} axis`}
          icon={<I.trash />} onClick={onRemoveAxis}
        />
      </div>
      {on && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {axis.options.map((option) => {
            const hasPrompt = !!String(option.prompt || '').trim();
            const open = openOptionId === option.id;
            return (
              <span
                key={option.id}
                onClick={() => onOpenOption(option.id)}
                title={option.hidden ? 'Hidden from the grid' : 'Edit this option’s prompt'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 19, padding: '0 6px', cursor: 'pointer',
                  borderRadius: 'var(--gb-r-pill)',
                  fontSize: 9.5, fontWeight: 650,
                  background: option.hidden ? 'transparent'
                    : open ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-soft)',
                  color: option.hidden ? 'var(--gb-text-tertiary)'
                    : open ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                  border: `1px solid ${option.hidden ? 'var(--gb-border-subtle)'
                    : open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                  textDecoration: option.hidden ? 'line-through' : 'none',
                }}
              >
                {option.swatch && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: option.swatch,
                    border: '1px solid var(--gb-border-default)',
                  }} />
                )}
                {option.label}
                {hasPrompt && (
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'var(--gb-brand-label)',
                  }} />
                )}
              </span>
            );
          })}
          {authored && <AddOption onAdd={onAddOption} />}
        </div>
      )}
      <AnimatePresence initial={false}>
        {on && openOptionId && (
          <motion.div
            key={openOptionId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {(() => {
              const option = axis.options.find((row) => row.id === openOptionId);
              if (!option) return null;
              return (
                <div style={{ paddingTop: 7, display: 'grid', gap: 5 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 9, fontFamily: mono, color: 'var(--gb-text-tertiary)',
                  }}>
                    {axis.label} · {option.label}
                    <span style={{ flex: 1 }} />
                    <span
                      onClick={() => onToggleOption(option.id)}
                      style={{ cursor: 'pointer', color: 'var(--gb-text-muted)' }}
                    >
                      {option.hidden ? 'Show' : 'Hide'}
                    </span>
                  </div>
                  <Textarea
                    value={option.prompt || ''}
                    onChange={(value) => onPatchOption(option.id, { prompt: value })}
                    placeholder={
                      axis.id.startsWith('scene')
                        ? 'Describe this scene once — e.g. worn by a person, natural posture'
                        : `Describe what “${option.label}” must preserve or change`
                    }
                    rows={2}
                  />
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Inline "add an option" chip for authored axes. */
function AddOption({ onAdd }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <span
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, height: 19,
          padding: '0 6px', cursor: 'pointer', borderRadius: 'var(--gb-r-pill)',
          border: '1px dashed var(--gb-border-default)', fontSize: 9.5,
          color: 'var(--gb-text-muted)',
        }}
      >
        <I.plus size={9} /> option
      </span>
    );
  }
  const commit = () => {
    onAdd(value);
    setValue('');
    setOpen(false);
  };
  return (
    <Input
      size="sm"
      value={value}
      onChange={setValue}
      autoFocus
      placeholder="Golf course"
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') { setValue(''); setOpen(false); }
      }}
      style={{ width: 108 }}
    />
  );
}

/** Imprint placements — one row per location, defaulting to a single logo. */
function PlacementsEditor({ placements, onChange }) {
  const rows = placements.length ? placements : [{
    id: 'personalized-logo', label: 'Personalized logo', description: '', prompt: '',
  }];
  const patch = (index, next) => onChange(
    rows.map((row, position) => (position === index ? { ...row, ...next } : row)),
  );
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((row, index) => (
        <div key={row.id || index} style={{ ...cardStyle, padding: 7, display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <Input
              size="sm" value={row.label || ''}
              onChange={(value) => patch(index, { label: value, id: toOptionId(value, row.id) })}
              placeholder="Left chest"
              style={{ flex: 1 }}
            />
            {rows.length > 1 && (
              <IconBtn
                size="sm" variant="ghost" title="Remove placement" icon={<I.trash />}
                onClick={() => onChange(rows.filter((_, position) => position !== index))}
              />
            )}
          </div>
          <Textarea
            value={row.prompt || ''}
            onChange={(value) => patch(index, { prompt: value })}
            placeholder="Optional placement prompt (10+ characters, or leave empty)"
            rows={2}
          />
        </div>
      ))}
      <Btn
        size="sm" variant="secondary"
        onClick={() => onChange([...rows, { id: '', label: '', description: '', prompt: '' }])}
      >
        Add placement
      </Btn>
    </div>
  );
}

export default MockupCatalogAdmin;
