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

describe('mockup gallery in-studio presentation', () => {
  it('reuses the studio chrome and provides an obvious route back to products', () => {
    assert.match(source, /batchHistoryOpen \? 'Batch gallery' : 'Product Mockup Studio'/);
    assert.match(source, />\s*Back to products\s*</);
    assert.match(source, /'Back to batches' : 'Back to products'/);
    assert.match(source, /onClose=\{requestClose\}/);
    assert.match(source, /onClick=\{closeCurrentBatch\}/);
    assert.match(source, /<ModalFooter style=\{\{ minHeight: 50/);
    assert.doesNotMatch(source, /function BatchModal/);
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
});
