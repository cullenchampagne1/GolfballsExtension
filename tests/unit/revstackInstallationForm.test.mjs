import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blockPath = resolve(root, '.revstack/blocks/analytics-scorecard.block.yaml');
const generator = resolve(root, 'scripts/build-revstack-installation-form.mjs');

describe('RevStack installation form generator', { skip: !existsSync(blockPath) }, () => {
  it('is repeatable and emits only the generic YAML modal vocabulary', () => {
    execFileSync(process.execPath, [generator], { cwd: root });
    execFileSync(process.execPath, [generator], { cwd: root });
    const block = readFileSync(blockPath, 'utf8');
    const action = block.slice(
      block.indexOf('  open-settings:'),
      block.indexOf('  # The first `form` action'),
    );

    assert.match(action, /kind: form/);
    assert.match(action, /id: installation_settings/);
    assert.equal([...action.matchAll(/type: setting_grid/g)].length, 5);
    assert.equal([...action.matchAll(/value_type: boolean/g)].length >= 25, true);
    assert.match(action, /key: "numberDisplay\.durationMs"[\s\S]*?value_type: number/);
    assert.match(action, /key: developer_section[\s\S]*?value_type: select/);
    assert.doesNotMatch(action, /type: kv_editor/);
    assert.doesNotMatch(action, /name: installation-settings|remote_table|maxWidth/);
  });
});
