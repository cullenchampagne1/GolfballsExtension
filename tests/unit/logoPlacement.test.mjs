import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../lib/logo-placement.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const model = context.GBLogoPlacement;

describe('custom-logo placement', () => {
  it('matches the accepted website crop geometry from the Express HAR', () => {
    assert.deepEqual({ ...model.PLACEMENT }, {
      width: 500,
      height: 500,
      left: 250.67,
      top: 301.67,
      scaleX: 0.52,
      scaleY: 0.52,
      opacity: 0.85,
    });
  });

  it('builds the same Fabric placement for every upload source', () => {
    const image = model.createUserImage('https://static.golfballs.com/Source/logo.png');
    assert.equal(image.src, 'https://static.golfballs.com/Source/logo.png');
    assert.equal(image.originX, 'center');
    assert.equal(image.originY, 'center');
    assert.equal(image.scaleX, 0.52);
    assert.equal(image.scaleY, 0.52);
    assert.equal(image.left, 250.67);
    assert.equal(image.top, 301.67);
    assert.equal(image.opacity, 0.85);
  });
});
