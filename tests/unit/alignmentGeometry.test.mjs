import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientDeltaToLocal,
  clientPointToLocal,
  localPointToClient,
  measuredAlignmentGeometry,
} from '../../src/lib/alignmentGeometry.js';

function scaledElement({
  left = 40,
  top = 25,
  width = 320,
  height = 240,
  scaleX = 1,
  scaleY = scaleX,
} = {}) {
  return {
    clientWidth: width,
    clientHeight: height,
    offsetWidth: width,
    offsetHeight: height,
    getBoundingClientRect() {
      return {
        left,
        top,
        width: width * scaleX,
        height: height * scaleY,
      };
    },
  };
}

describe('alignment geometry', () => {
  it('maps the same local point through normal, reduced, and enlarged modal scales', () => {
    for (const scale of [0.5, 1, 1.35]) {
      const surface = scaledElement({ scaleX: scale });
      const client = localPointToClient(surface, 136, 92);
      const local = clientPointToLocal(surface, client.x, client.y);
      assert.ok(Math.abs(local.x - 136) < 1e-9);
      assert.ok(Math.abs(local.y - 92) < 1e-9);
    }
  });

  it('normalizes pointer drag distance into the alignment surface coordinate system', () => {
    const halfScale = scaledElement({ scaleX: 0.5 });
    const enlarged = scaledElement({ scaleX: 1.25 });

    assert.deepEqual(clientDeltaToLocal(halfScale, 24, -12), { x: 48, y: -24 });
    assert.deepEqual(clientDeltaToLocal(enlarged, 50, -25), { x: 40, y: -20 });
  });

  it('does not misread the alignment surface border as fractional zoom', () => {
    const bordered = {
      clientWidth: 320,
      clientHeight: 240,
      offsetWidth: 322,
      offsetHeight: 242,
      clientLeft: 1,
      clientTop: 1,
      getBoundingClientRect: () => ({ left: 40, top: 25, width: 161, height: 121 }),
    };

    const client = localPointToClient(bordered, 160, 120);
    assert.deepEqual(client, { x: 120.5, y: 85.5 });
    assert.deepEqual(clientPointToLocal(bordered, client.x, client.y), { x: 160, y: 120 });
  });

  it('captures the rendered image and ring boxes instead of an assumed stage fit', () => {
    const surface = { clientWidth: 368, clientHeight: 320 };
    const image = { clientWidth: 96, clientHeight: 48, naturalWidth: 640, naturalHeight: 320 };
    const ring = { clientWidth: 224 };

    assert.deepEqual(measuredAlignmentGeometry(surface, image, ring), {
      surfaceWidth: 368,
      surfaceHeight: 320,
      imageWidth: 96,
      imageHeight: 48,
      ringDiameter: 224,
    });
  });
});
