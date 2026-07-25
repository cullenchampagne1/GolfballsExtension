import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/modals/MockupStudio.jsx', import.meta.url),
  'utf8',
);
const traySource = source.slice(
  source.indexOf('function BatchTray'),
  source.indexOf('function ReferenceGrid'),
);
const historySource = source.slice(
  source.indexOf('function BatchHistoryMetric'),
  source.indexOf('function BatchView'),
);
const ringSource = source.slice(
  source.indexOf('function BatchRingBurst'),
  source.indexOf('function FullResultViewer'),
);
const viewerSource = source.slice(
  source.indexOf('function FullResultViewer'),
  source.indexOf('function ResultCard'),
);
const batchViewSource = source.slice(
  source.indexOf('function BatchView'),
  source.indexOf('export function MockupStudio'),
);
const studioHeaderStart = source.indexOf(
  '<ModalHeader',
  source.indexOf('export function MockupStudio'),
);
const studioHeaderSource = source.slice(
  studioHeaderStart,
  source.indexOf('<AnimatePresence>', studioHeaderStart),
);

describe('mockup gallery in-studio presentation', () => {
  it('reuses the studio chrome and provides an obvious route back to products', () => {
    assert.match(source, /batchHistoryOpen \? 'Batch gallery' : 'Product Mockup Studio'/);
    assert.match(source, />\s*Back to products\s*</);
    assert.match(source, /'Back to batches' : 'Back to products'/);
    assert.match(source, /onClose=\{requestClose\}/);
    assert.match(source, /onClick=\{closeCurrentBatch\}/);
    assert.match(source, /<ModalFooter style=\{\{ minHeight: 50/);
    assert.doesNotMatch(source, /function BatchModal/);
    assert.doesNotMatch(studioHeaderSource, /StatusPill/);
  });

  it('slides between product selection and the selected batch in the same content area', () => {
    assert.match(source, /key=\{`batch:\$\{currentBatch\.batch_id\}`\}/);
    assert.match(source, /initial=\{\{ opacity: 0, x: 28 \}\}/);
    assert.match(source, /key="studio"[\s\S]*initial=\{\{ opacity: 0, x: -28 \}\}/);
    assert.match(source, /<BatchView[\s\S]*batch=\{currentBatch\}/);
    assert.match(source, /background: 'var\(--gb-surface-2\)'/);
    assert.doesNotMatch(source, /zIndex: 45/);
  });

  it('caps the quick menu at three recent batches and makes View all actionable', () => {
    assert.match(source, /const RECENT_BATCH_LIMIT = 3/);
    assert.match(traySource, /batches\.slice\(0, RECENT_BATCH_LIMIT\)/);
    assert.match(traySource, /recentBatches\.map\(\(batch\)/);
    assert.match(traySource, /onClick=\{onViewAll\}/);
    assert.match(traySource, />\s*View all\s*</);
    assert.doesNotMatch(traySource, /disabled/);
  });

  it('presents all batches as summary cards instead of mockup result tiles', () => {
    assert.match(historySource, /function BatchHistoryCard/);
    assert.match(historySource, /gridTemplateColumns: 'repeat\(auto-fill, minmax\(290px, 1fr\)\)'/);
    assert.match(historySource, />\s*Render archive\s*</);
    assert.match(historySource, />\s*Open batch\s*</);
    assert.match(historySource, /<ProgressBar value=\{progress\.percent \|\| 0\}/);
    assert.doesNotMatch(historySource, /<ResultArtwork/);
    assert.doesNotMatch(historySource, /<ResultCard/);
  });

  it('returns batch details to history when they were opened from View all', () => {
    assert.match(source, /key="batch-history"/);
    assert.match(source, /openBatchById\(batchId, \{ returnToHistory: true \}\)/);
    assert.match(source, /setBatchHistoryOpen\(returnToHistory\)/);
  });

  it('uses the shared Quick Send motion language for batch progress', () => {
    assert.match(ringSource, /counterpart to EmailRunner's HeroRing/);
    assert.match(ringSource, /role="progressbar"/);
    assert.match(ringSource, /strokeDasharray=\{BATCH_RING_CIRCUMFERENCE\}/);
    assert.match(ringSource, /stroke-dashoffset \.55s cubic-bezier\(\.34,1\.4,\.64,1\)/);
    assert.match(ringSource, /conic-gradient\(from 0deg/);
    assert.match(ringSource, /gb-ms-ring-ripple/);
    assert.match(ringSource, /<BatchRingBurst accent=\{accent\}/);
  });

  it('gives batch detail the archive header treatment without a long progress bar', () => {
    assert.match(batchViewSource, /<BatchProgressRing batch=\{batch\}/);
    assert.match(batchViewSource, /linear-gradient\(135deg, var\(--gb-brand-tint-soft\)/);
    assert.match(batchViewSource, />\s*Batch progress\s*/);
    assert.match(batchViewSource, /gridTemplateColumns: 'repeat\(4, minmax\(0, 1fr\)\)'/);
    assert.match(batchViewSource, /label="Generating"/);
    assert.doesNotMatch(batchViewSource, /<ProgressBar/);
  });

  it('uses the shared landscape image viewer without changing downloaded assets', () => {
    assert.match(source, /createCornerTransparentPreview/);
    assert.match(viewerSource, /const displayUrl = useCornerTransparentPreview/);
    assert.match(viewerSource, /\.\.\.PREVIEW_GRID/);
    assert.match(viewerSource, /<ViewerZoomControls/);
    assert.match(
      viewerSource,
      /flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden'/,
    );
    assert.match(viewerSource, /src=\{displayUrl\}/);
    assert.match(viewerSource, /saveResultAsset\(\s*asset,/);
    assert.doesNotMatch(viewerSource, /aspectRatio: '1 \/ 1'/);
    assert.doesNotMatch(viewerSource, /height: 'min\(100%, 620px\)'/);
  });
});
