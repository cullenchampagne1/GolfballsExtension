import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getThreeRuntime,
  THREE_RUNTIME_GLOBAL,
} from '../../src/lib/threeRuntime.js';

function completeRuntime() {
  return {
    THREE: {},
    OBJLoader() {},
    DecalGeometry() {},
    EXRLoader() {},
    RoomEnvironment() {},
    CANNON: {},
  };
}

describe('shared Three.js runtime accessor', () => {
  it('returns the exact runtime installed in the extension world', () => {
    const runtime = completeRuntime();
    const scope = { [THREE_RUNTIME_GLOBAL]: runtime };

    assert.equal(getThreeRuntime(scope), runtime);
  });

  it('rejects a missing runtime with a stable viewer-facing error', () => {
    assert.throws(
      () => getThreeRuntime({}),
      /shared 3D runtime is unavailable/,
    );
  });

  it('names every missing bridge export instead of failing later in WebGL setup', () => {
    const runtime = completeRuntime();
    delete runtime.DecalGeometry;
    delete runtime.CANNON;

    assert.throws(
      () => getThreeRuntime({ [THREE_RUNTIME_GLOBAL]: runtime }),
      /DecalGeometry, CANNON/,
    );
  });
});
