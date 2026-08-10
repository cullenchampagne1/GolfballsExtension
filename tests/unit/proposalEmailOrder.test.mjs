import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildProposalOutline, moveProposalItem } from '../../src/lib/proposalEmailOrder.js';

const line = (id, title, qty) => ({
  id,
  product: { title, brand: 'Titleist' },
  splits: [{ qty, price: 1 }],
});

const row = (lineId, title, qty) => ({ lineId, title, brand: 'Titleist', qty });

describe('proposal email structure outline', () => {
  it('builds one named section with one item per proposal line', () => {
    const source = {
      optionName: 'Premium Option',
      rawLines: [line('A', 'Pro V1', 12), line('B', 'AVX', 6)],
      lines: [row('A', 'Pro V1', 12), row('B', 'AVX', 6)],
    };

    assert.deepEqual(buildProposalOutline(source), [{
      index: 0,
      key: 'section:0',
      label: 'Premium Option',
      items: [
        { key: 'line:A', title: 'Pro V1', brand: 'Titleist', quantity: 12, free: false },
        { key: 'line:B', title: 'AVX', brand: 'Titleist', quantity: 6, free: false },
      ],
    }]);
  });

  it('keeps every generated split row together when an item moves', () => {
    const source = {
      optionName: 'Premium Option',
      rawLines: [line('A', 'Pro V1', 12), line('B', 'AVX', 6)],
      lines: [row('A', 'Pro V1', 6), row('A', 'Pro V1', 6), row('B', 'AVX', 6)],
    };

    const moved = moveProposalItem(source, 0, 0, 1);
    assert.deepEqual(moved.rawLines.map((item) => item.id), ['B', 'A']);
    assert.deepEqual(moved.lines.map((item) => item.lineId), ['B', 'A', 'A']);
    assert.deepEqual(source.rawLines.map((item) => item.id), ['A', 'B'], 'does not mutate the original source');
  });

  it('moves items only inside the selected multi-proposal section', () => {
    const source = {
      sections: [
        {
          optionName: 'Executive Golf Balls',
          rawLines: [line('A', 'Pro V1', 12), line('B', 'AVX', 6)],
          lines: [row('A', 'Pro V1', 12), row('B', 'AVX', 6)],
        },
        {
          optionName: 'Event Gift Sets',
          rawLines: [line('C', 'Custom Gift Box', 8), line('D', 'Wooden Gift Box', 4)],
          lines: [row('C', 'Custom Gift Box', 8), row('D', 'Wooden Gift Box', 4)],
        },
      ],
      rawLines: [],
      lines: [],
    };

    const outline = buildProposalOutline(source);
    assert.deepEqual(outline.map((section) => section.label), ['Executive Golf Balls', 'Event Gift Sets']);

    const moved = moveProposalItem(source, 1, 0, 1);
    assert.deepEqual(moved.sections[0].rawLines.map((item) => item.id), ['A', 'B']);
    assert.deepEqual(moved.sections[1].rawLines.map((item) => item.id), ['D', 'C']);
    assert.deepEqual(moved.sections[1].lines.map((item) => item.lineId), ['D', 'C']);
    assert.deepEqual(moved.rawLines.map((item) => item.id), ['A', 'B', 'D', 'C']);
  });

  it('keeps proposal structure in a dedicated rail between settings and preview', () => {
    const composer = readFileSync(new URL('../../src/modals/ProposalEmail.jsx', import.meta.url), 'utf8');
    const settingsAt = composer.indexOf('data-proposal-settings-rail');
    const structureAt = composer.indexOf('data-proposal-structure-rail');
    const previewAt = composer.indexOf('data-proposal-preview');

    assert.ok(settingsAt >= 0 && structureAt > settingsAt && previewAt > structureAt);
    assert.doesNotMatch(composer.slice(settingsAt, structureAt), /<ProposalStructureRail/);
    assert.match(composer.slice(structureAt - 20, previewAt), /<aside data-proposal-structure-rail/);
    assert.match(composer.slice(structureAt, previewAt), /width: 300/);
    assert.match(composer.slice(structureAt, previewAt), /<ProposalStructureRail/);
  });
});
