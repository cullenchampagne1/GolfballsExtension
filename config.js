// config.js — extension build configuration.
//
// Single source of truth for the backend origin the extension talks to for
// installation enrollment, the self-hosted update channel, and settings/
// template/product share links. A Chrome MV3 extension has no runtime env, so
// this committed file is the "env": change the one value below (and the
// matching update_url / host_permissions in manifest.json) to point a build at
// your own backend. The extension's runtime code never hardcodes the origin —
// it reads it from here.
//
// Loaded first by the service worker (see importScripts in background.js), so
// globalThis.GB_BACKEND_ORIGIN is defined before any enrollment or API call.
globalThis.GB_BACKEND_ORIGIN = 'https://api.cullenchampagne.com';
