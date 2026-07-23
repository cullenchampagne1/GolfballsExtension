/**
 * Integration flow — anonymous installation enrollment lifecycle.
 *
 * Real installation-auth.js runs in a vm sandbox; only chrome.* and fetch are
 * mocked. Covers: fresh install → POST /auth/extension-installation →
 * credential stored; repeated ensureInstallation()/onStartup reuse; an invalid
 * stored credential (bad rsk_ format or foreign extension id) forcing a
 * re-enroll.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY, API_ORIGIN, EXTENSION_ID, INSTALLATION_ID, MANIFEST,
  createFetchMock, jsonResponse, loadBackground, loadInstallationAuth, settle,
  validInstallation,
} from './helpers/harness.mjs';

const ENROLLMENT_URL = `${API_ORIGIN}/auth/extension-installation`;
const IDENTITY_PATH = '/projects/golfballs-extension/client/identity';

function enrollmentRouter(url) {
  if (url === ENROLLMENT_URL) {
    return jsonResponse({
      installation_id: INSTALLATION_ID,
      api_key: API_KEY,
      key_prefix: 'rsk_aaaaaaaaaaaa_…',
      rate_limit: { requests: 30, window_seconds: 60 },
    }, 201);
  }
  return jsonResponse({ ok: true });
}

function makeSandbox(stored = {}) {
  const { fetchMock, requests } = createFetchMock(enrollmentRouter);
  const sandbox = loadInstallationAuth({ stored, fetchImpl: fetchMock });
  return { ...sandbox, requests };
}

const enrollments = (requests) => requests.filter(({ url }) => url === ENROLLMENT_URL);

describe('enrollment lifecycle', () => {
  it('continues a fresh enrollment through runtime verification and page-script activation', async () => {
    const { fetchMock, requests } = createFetchMock(enrollmentRouter);
    const background = await loadBackground({ stored: {}, fetchImpl: fetchMock });

    assert.equal(enrollments(requests).length, 1);
    assert.equal(background.healthRequests.length, 1);
    assert.equal(background.healthRequests[0].method, 'GET');
    assert.equal(
      background.healthRequests[0].options.headers.get('Authorization'),
      `Bearer ${API_KEY}`,
    );
    assert.equal(background.actionState.enabled, true);
    assert.equal(background.registeredContentScripts.length, 6);
    assert.equal(background.stored.gbRuntimeState.o, 1);
    assert.equal(background.context.GBRuntimeCoordinator.isOpen(), true);
  });

  it('enrolls exactly once on fresh install and persists the credential', async () => {
    const { client, stored, listeners, requests } = makeSandbox();
    assert.equal(listeners.installed.length, 0, 'the runtime coordinator owns installation startup');
    await client.ensureInstallation();
    await settle();

    assert.equal(enrollments(requests).length, 1);
    const [request] = enrollments(requests);
    assert.equal(request.method, 'POST');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.referrerPolicy, 'no-referrer');

    assert.equal(stored.gbApiInstallation.installationId, INSTALLATION_ID);
    assert.equal(stored.gbApiInstallation.apiKey, API_KEY);
    assert.equal(stored.gbApiInstallation.extensionId, EXTENSION_ID);
    assert.equal(stored.gbApiInstallation.extensionVersion, MANIFEST.version);
  });

  it('reuses the stored key on later ensureInstallation and browser startup', async () => {
    const { client, listeners, requests } = makeSandbox({ gbApiInstallation: validInstallation() });

    const first = await client.ensureInstallation();
    assert.equal(first.apiKey, API_KEY);
    assert.equal(listeners.startup.length, 0, 'installation auth does not own worker startup');
    await client.ensureInstallation();
    await settle();

    assert.equal(enrollments(requests).length, 0, 'a valid stored credential must never re-enroll');
    const status = await client.getStatus();
    assert.equal(status.enrolled, true);
    assert.equal(status.installationId, INSTALLATION_ID);
    assert.equal(Object.hasOwn(status, 'apiKey'), false, 'status must never expose the secret');
  });

  it('re-enrolls when the stored credential has an invalid rsk_ key format', async () => {
    const bad = validInstallation({ apiKey: 'rsk_notavalidkey' });
    const { client, stored, requests } = makeSandbox({ gbApiInstallation: bad });

    const installation = await client.ensureInstallation();
    assert.equal(enrollments(requests).length, 1, 'a malformed key must trigger one re-enroll');
    assert.equal(installation.apiKey, API_KEY);
    assert.equal(stored.gbApiInstallation.apiKey, API_KEY, 'the fresh credential replaces the invalid one');
  });

  it('re-enrolls when the stored credential belongs to another extension id', async () => {
    const foreign = validInstallation({ extensionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
    const { client, stored, requests } = makeSandbox({ gbApiInstallation: foreign });

    await client.ensureInstallation();
    assert.equal(enrollments(requests).length, 1);
    assert.equal(stored.gbApiInstallation.extensionId, EXTENSION_ID);
  });

  it('deduplicates concurrent ensureInstallation calls into one enrollment', async () => {
    const { client, requests } = makeSandbox();
    const [a, b] = await Promise.all([client.ensureInstallation(), client.ensureInstallation()]);
    assert.equal(enrollments(requests).length, 1, 'parallel callers share a single enrollment request');
    assert.equal(a.apiKey, b.apiKey);
  });

  it('backfills an existing installation from email.localPart without re-enrolling', async () => {
    const identityRequests = [];
    const { fetchMock, requests } = createFetchMock((url, options) => {
      const path = new URL(url).pathname;
      if (path !== IDENTITY_PATH) return enrollmentRouter(url);
      identityRequests.push({ method: String(options.method || 'GET'), body: options.body });
      if (String(options.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(options.body);
        return jsonResponse({
          registered: true,
          installation_id: INSTALLATION_ID,
          display_name: body.display_name,
          local_part: body.local_part,
          source: body.source,
        });
      }
      return jsonResponse({ registered: false, installation_id: INSTALLATION_ID });
    });
    const sandbox = loadInstallationAuth({
      stored: {
        gbApiInstallation: validInstallation(),
        devSettings: { 'email.localPart': 'taylor.smith' },
      },
      fetchImpl: fetchMock,
    });

    await sandbox.client.syncIdentityFromStorage();

    assert.equal(enrollments(requests).length, 0);
    assert.deepEqual(identityRequests.map(({ method }) => method), ['GET', 'POST']);
    const submitted = JSON.parse(identityRequests[1].body);
    assert.equal(submitted.display_name, 'Taylor Smith');
    assert.equal(submitted.local_part, 'taylor.smith');
    assert.equal(submitted.source, 'email_local_part');
    assert.equal(sandbox.stored.gbInstallationIdentity.displayName, 'Taylor Smith');
    assert.equal(sandbox.stored.gbApiInstallation.apiKey, API_KEY);
  });

  it('keeps the existing key and requests a Settings name when no local part exists', async () => {
    const { fetchMock, requests } = createFetchMock((url, options) => {
      if (new URL(url).pathname === IDENTITY_PATH) {
        if (String(options.method || 'GET').toUpperCase() === 'POST') {
          const body = JSON.parse(options.body);
          return jsonResponse({
            registered: true,
            installation_id: INSTALLATION_ID,
            display_name: body.display_name,
            local_part: body.local_part,
            source: body.source,
          });
        }
        return jsonResponse({ registered: false, installation_id: INSTALLATION_ID });
      }
      return enrollmentRouter(url);
    });
    const sandbox = loadInstallationAuth({
      stored: { gbApiInstallation: validInstallation(), devSettings: {} },
      fetchImpl: fetchMock,
    });

    const identity = await sandbox.client.syncIdentityFromStorage();
    assert.equal(identity.promptRequired, true);
    assert.equal(enrollments(requests).length, 0);

    const registered = await sandbox.client.registerIdentity('Jordan Lee');
    assert.equal(registered.displayName, 'Jordan Lee');
    assert.equal(registered.localPart, '');
    assert.equal(registered.source, 'settings_prompt');
    assert.equal(enrollments(requests).length, 0);
    assert.equal(sandbox.stored.gbApiInstallation.installationId, INSTALLATION_ID);
  });
});
