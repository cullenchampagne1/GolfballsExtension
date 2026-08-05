/**
 * Custom contact/account page — create → reload (not optimistic insert).
 *
 * A newly-created task/opportunity gets its real id from the backend, so the
 * page must reload like the native postback (the page engine re-extracts the
 * native tables) instead of inserting a client-side row with a useless temp id.
 * Source-presence checks (the module is JSX + browser-only, so it can't be
 * imported into node:test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/lib/crm-detail-shared.jsx', import.meta.url),
  'utf8',
);

const slice = (from, to) => {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + 1);
  return a >= 0 && b > a ? source.slice(a, b) : '';
};

describe('crm detail · create reloads for real backend ids', () => {
  it('defines a reload helper that reloads the page after a short delay', () => {
    const helper = slice('export function reloadForFreshIds', '\n}');
    assert.match(helper, /setTimeout/);
    assert.match(helper, /window\.location\.reload\(\)/);
  });

  it('reloads after a task create instead of inserting a temp-id row', () => {
    // addRow no longer builds an optimistic `openTasks: [{ id: `new-… }]` row.
    const addRow = slice('const addRow = (row) =>', '\n  };');
    assert.match(addRow, /reloadForFreshIds\(\)/);
    assert.doesNotMatch(addRow, /openTasks:\s*\[\{/);
    assert.doesNotMatch(addRow, /new-\$\{nextTaskTempId/);
  });

  it('reloads after an opportunity create instead of prepending an optimistic row', () => {
    const save = slice('const save = async () =>', 'closeModal();\n      reloadForFreshIds();');
    assert.match(source, /reloadForFreshIds\(\);\n\s*\}\s*catch/);
    // The old optimistic opportunity prepend (temp-id row) is gone.
    assert.doesNotMatch(save, /opportunities:\s*exists\s*\?/);
    assert.doesNotMatch(save, /new-\$\{nextTaskTempId/);
  });
});

describe('crm detail · sidebar current-user identity', () => {
  it('uses the global signed-in user instead of the current record owner', () => {
    const sidebar = slice('export function Sidebar', '\nexport function DetailPageFrame');
    assert.match(source, /resolveCurrentUserContext, subscribeCurrentUserContext/);
    assert.match(sidebar, /currentUser && currentUser\.name/);
    assert.match(sidebar, /currentUser\?\.employeeId/);
    assert.doesNotMatch(sidebar, /D\.account|territoryName/);
  });
});
