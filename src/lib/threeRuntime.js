/* Shared Three.js runtime access.
 *
 * The extension has several independently built content-script entrypoints,
 * but they all execute in the same isolated Chrome world. Bundling Three.js
 * into each entrypoint created multiple runtimes and made Three emit its
 * duplicate-instance warning on every page. The manifest now installs one
 * runtime bundle first and every 3D surface reads it through this accessor.
 */

export const THREE_RUNTIME_GLOBAL = '__gbThreeRuntime';

const REQUIRED_EXPORTS = Object.freeze([
  'THREE',
  'OBJLoader',
  'DecalGeometry',
  'EXRLoader',
  'RoomEnvironment',
  'CANNON',
]);

export function getThreeRuntime(scope = globalThis) {
  const runtime = scope && scope[THREE_RUNTIME_GLOBAL];
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('The shared 3D runtime is unavailable.');
  }

  const missing = REQUIRED_EXPORTS.filter((name) => !runtime[name]);
  if (missing.length) {
    throw new Error(`The shared 3D runtime is incomplete: ${missing.join(', ')}`);
  }

  return runtime;
}
