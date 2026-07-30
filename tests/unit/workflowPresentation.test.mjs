import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WORKFLOW_MANAGER_SCALE_DEFAULT,
  fitWorkflowManagerScale,
  normalizeWorkflowManagerScale,
} from '../../src/lib/workflow/presentation.js';
import { applyFloatingHostScale } from '../../src/lib/floatingHost.js';
import { DEV_SETTINGS } from '../../src/lib/devSettings.js';

const managerSource = readFileSync(
  new URL('../../src/modals/WorkflowManager.jsx', import.meta.url),
  'utf8',
);
const blocksSource = readFileSync(
  new URL('../../src/ui/components/BlocksView.jsx', import.meta.url),
  'utf8',
);

function fakeHost() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

describe('Workflow Manager presentation scale', () => {
  it('accepts the requested 0.5× scale and clamps unsafe stored values', () => {
    const registry = DEV_SETTINGS.find((setting) => setting.key === 'workflowManager.scale');
    assert.equal(registry?.min, 0.5);
    assert.equal(normalizeWorkflowManagerScale(0.5), 0.5);
    assert.equal(normalizeWorkflowManagerScale('0.75'), 0.75);
    assert.equal(normalizeWorkflowManagerScale(0.1), 0.5);
    assert.equal(normalizeWorkflowManagerScale(9), 2);
    assert.equal(normalizeWorkflowManagerScale('not-a-number'), WORKFLOW_MANAGER_SCALE_DEFAULT);
  });

  it('lets a self-scaled surface opt out of the shared modal root scale', () => {
    const host = fakeHost();
    applyFloatingHostScale(host);
    assert.equal(host.attributes.get('data-gb-scale'), 'modals');

    applyFloatingHostScale(host, null);
    assert.equal(host.attributes.has('data-gb-scale'), false);
  });

  it('uniformly fits the full editor when page zoom reduces the CSS viewport', () => {
    assert.equal(fitWorkflowManagerScale(1.2, 1920, 1080), 1.2);
    assert.equal(fitWorkflowManagerScale(1.2, 800, 600), 0.5875);
    assert.equal(fitWorkflowManagerScale(0.5, 1920, 1080), 0.5);
  });

  it('keeps workflow identity and completed-run navigation discoverable', () => {
    assert.match(managerSource, /<Field label="Workflow name"/);
    assert.match(managerSource, />\s*Back to workflows\s*</);
    assert.match(managerSource, /@keyframes workflow-repeat-hit/);
    assert.match(managerSource, /advanceRunRow\(current\[contact\._key\], event, pipeline\)/);
  });

  it('replays and visibly restarts repeated function-call animations', () => {
    assert.match(managerSource, /current\?\.kind === 'function' \? 320 : 600/);
    assert.match(blocksSource, /key=\{`\$\{block\.id\}:\$\{d\.runs\}`\}/);
    assert.match(blocksSource, /CALLED ×\{d\.runs\}/);
  });

  it('confirms a live run without hydrating or simulating a contact first', () => {
    const start = managerSource.indexOf('const startRun = () =>');
    const end = managerSource.indexOf('\n\n  return (', start);
    const startRunSource = managerSource.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(startRunSource, /planRunFromPipeline\(program\.pipeline, audienceKeyed\.length\)/);
    assert.doesNotMatch(startRunSource, /prepareWorkflowContact|simulateProgram|audienceKeyed\[0\]/);
    assert.match(managerSource, /each contact is loaded and evaluated once/);
    assert.doesNotMatch(managerSource, /Total effects/);
  });
});
