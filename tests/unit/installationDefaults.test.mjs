import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';


const root = new URL('../../', import.meta.url);
const background = readFileSync(new URL('background.js', root), 'utf8');


describe('clean-install template boundary', () => {
  it('does not ship or seed exported employee templates into new installations', () => {
    assert.equal(existsSync(new URL('lib/defaults.js', root)), false);
    assert.doesNotMatch(background, /lib\/defaults\.js/);
    assert.doesNotMatch(background, /GB_FACTORY_DEFAULTS/);
    assert.doesNotMatch(background, /reason\s*!==\s*['"]install['"]/);
  });

  it('continues to install the storefront request rule without template seeding', () => {
    assert.match(background, /gbInstallSmartyHeaderRule\(\);/);
    assert.match(background, /chrome\.runtime\.onStartup/);
  });
});
