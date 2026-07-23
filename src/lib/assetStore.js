/* assetStore.js — on-demand loader for the heavy 3D-viewer assets.
 *
 * The extension no longer bundles its ~45MB of models, HDRIs, and textures.
 * The 3D viewer asks this module for an asset by its old bundled path (e.g.
 * "assets/golfball_model/Golf_ball.obj"); on first use it is downloaded from
 * the backend's public asset route and saved in the Cache API, then handed
 * back as a local `blob:` URL the three.js loaders (OBJLoader / EXRLoader /
 * TextureLoader) consume directly. Cached assets resolve instantly on later
 * mounts, so the download screen only appears the first time.
 *
 * Fetch happens in the content-script context (the asset route sends permissive
 * CORS and the manifest grants host access), so no large binaries cross the
 * message channel. The backend origin is the single source in config.js
 * (service-worker global); we read it once via a tiny message.
 */

const ASSET_CACHE = 'gb-viewer-assets-v1';
const ASSET_PREFIX = '/projects/golfballs-extension/assets/';

let _originPromise = null;
/** The backend origin, resolved once from the service worker (config.js owns it). */
export function backendOrigin() {
  if (_originPromise) return _originPromise;
  _originPromise = new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: 'gbBackendOrigin' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.origin) {
          reject(new Error(chrome.runtime.lastError?.message || 'backend origin unavailable'));
        } else {
          resolve(res.origin.replace(/\/+$/, ''));
        }
      });
    } catch (err) { reject(err); }
  });
  _originPromise.catch(() => { _originPromise = null; }); // allow retry
  return _originPromise;
}

function assetUrl(origin, rel) {
  // rel is the old bundled path ("assets/foo/bar.obj"); the served path drops
  // the leading "assets/".
  const name = String(rel).replace(/^\/?assets\//, '');
  return `${origin}${ASSET_PREFIX}${name}`;
}

async function openCache() {
  try { return await caches.open(ASSET_CACHE); } catch { return null; }
}

const _blobUrls = new Map(); // rel -> Promise<blobURL> (one download per page)

/**
 * Resolve a `blob:` URL for one asset, downloading + caching it on first use.
 * @param {string} rel  old bundled path, e.g. "assets/golfball_model/Golf_ball.obj"
 * @param {(received:number, total:number) => void} [onProgress]  byte progress
 * @returns {Promise<string>} a blob: URL usable by three.js loaders
 */
export function getAssetURL(rel, onProgress) {
  if (_blobUrls.has(rel)) return _blobUrls.get(rel);
  const p = (async () => {
    const origin = await backendOrigin();
    const url = assetUrl(origin, rel);
    const cache = await openCache();

    let response = cache ? await cache.match(url) : null;
    if (response) {
      const total = Number(response.headers.get('content-length')) || 0;
      onProgress?.(total, total); // cache hit → instantly complete
    } else {
      const net = await fetch(url, { credentials: 'omit' });
      if (!net.ok || !net.body) throw new Error(`asset ${net.status} for ${rel}`);
      const total = Number(net.headers.get('content-length')) || 0;
      const reader = net.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(received, total);
      }
      const type = net.headers.get('content-type') || 'application/octet-stream';
      const blob = new Blob(chunks, { type });
      // Cache a fresh Response (the streamed one is consumed) for next time.
      if (cache) {
        try {
          await cache.put(url, new Response(blob, {
            headers: { 'content-type': type, 'content-length': String(received) },
          }));
        } catch { /* storage full / unavailable — still usable this session */ }
      }
      response = new Response(blob, { headers: { 'content-type': type } });
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();
  _blobUrls.set(rel, p);
  p.catch(() => _blobUrls.delete(rel)); // allow retry after a failure
  return p;
}

export default getAssetURL;
