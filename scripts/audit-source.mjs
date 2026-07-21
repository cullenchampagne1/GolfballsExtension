/**
 * Repository-wide static audit gate.
 *
 * Every tracked or unignored project file is inventoried. Text artifacts are
 * inspected for insecure transport, committed credentials, unsafe cross-frame
 * messaging, stale diagnostics, malformed JSON, and repository hygiene. Build
 * output and binary assets are counted but not mistaken for authored source.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
}).split('\n').filter(Boolean);
const files = [...new Set(listed)].filter((file) => {
  try { return statSync(new URL(file, root)).isFile(); } catch { return false; }
}).sort();

const textExtensions = new Set([
  '.cjs', '.css', '.csv', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.svg', '.txt', '.xml', '.yaml', '.yml',
]);
const executableExtensions = new Set(['.cjs', '.html', '.js', '.jsx', '.mjs']);
const generatedPrefixes = ['react-dist/', 'src/lib/helpContent.js'];
const vendorPrefixes = ['node_modules/'];
const runtimePrefixes = ['iframe/', 'src/content/', 'src/lib/', 'src/modals/', 'src/ui/', 'src/vanilla/'];
const runtimeRootFiles = new Set([
  'background.js', 'installation-auth.js', 'help-assistant.js', 'help-chat-state.js',
  'remote-settings-policy.js', 'email-relay-poll.js', 'notifications-store.js',
]);
const errors = [];
const warnings = [];
const totals = { files: 0, text: 0, binary: 0, authored: 0, generated: 0, assets: 0 };

function fail(file, message) { errors.push(`${file}: ${message}`); }
function warn(file, message) { warnings.push(`${file}: ${message}`); }
function isGenerated(file) { return generatedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)); }

for (const file of files) {
  totals.files += 1;
  const extension = extname(file).toLowerCase();
  const generated = isGenerated(file);
  if (generated) totals.generated += 1;
  else if (file.startsWith('assets/') || file.startsWith('icons/')) totals.assets += 1;
  else totals.authored += 1;

  if (vendorPrefixes.some((prefix) => file.startsWith(prefix))) fail(file, 'vendored dependency is tracked');
  if (file === '.DS_Store' || file.endsWith('/.DS_Store')) fail(file, 'macOS metadata is tracked');

  if (!textExtensions.has(extension) && !['Dockerfile', 'LICENSE'].includes(file)) {
    totals.binary += 1;
    continue;
  }
  totals.text += 1;
  const source = readFileSync(new URL(file, root), 'utf8');

  if (extension === '.json') {
    try { JSON.parse(source); } catch (error) { fail(file, `invalid JSON (${error.message})`); }
  }
  if (generated) continue;

  if (/[ \t]+$/m.test(source)) warn(file, 'contains trailing whitespace');
  if (/\n{5,}/.test(source)) warn(file, 'contains five or more consecutive blank lines');

  if (executableExtensions.has(extension)) {
    const withoutNamespaces = source
      .replaceAll('http://www.w3.org/', 'https://www.w3.org/')
      .replaceAll('http://schemas.openxmlformats.org/', 'https://schemas.openxmlformats.org/');
    if (/http:\/\//i.test(withoutNamespaces)
        && file !== 'scripts/audit-source.mjs'
        && !source.includes('SECURITY-AUDITED-HTTP-NEGATIVE-TEST')) {
      fail(file, 'contains an insecure HTTP channel');
    }
    if (/\bTEMP DEBUG\b/i.test(source)) fail(file, 'contains a temporary debug block');
    if (/postMessage\([\s\S]{0,500},\s*['"]\*['"]\s*\)/.test(source)
        && !source.includes('SECURITY-AUDITED:')) {
      fail(file, 'uses wildcard postMessage without an audited opaque-origin exception');
    }
    if (source.includes('dangerouslySetInnerHTML') && !source.includes('SECURITY-AUDITED:')) {
      fail(file, 'uses dangerouslySetInnerHTML without a local security rationale');
    }
    if (runtimeRootFiles.has(file) || runtimePrefixes.some((prefix) => file.startsWith(prefix))) {
      const ungated = source.split('\n')
        .filter((line) => !line.includes('SECURITY-AUDITED-DEV-SETTING-CONSOLE'))
        .join('\n');
      if (/console\.(?:log|debug|info|warn|error|trace|table|group|groupCollapsed|groupEnd)\s*\(/.test(ungated)) {
        fail(file, 'contains runtime console output outside a visible Developer Setting');
      }
    }
  }

  const secretPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  ];
  if (secretPatterns.some((pattern) => pattern.test(source))) fail(file, 'contains a likely committed credential');
}

const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const manifestText = JSON.stringify(manifest);
if (manifestText.includes('*://') || manifestText.includes('http://')) fail('manifest.json', 'permits non-HTTPS origins');
for (const directive of ['default-src \'none\'', 'connect-src \'none\'', 'form-action \'none\'', 'worker-src \'none\'']) {
  if (!manifest.content_security_policy?.sandbox?.includes(directive)) fail('manifest.json', `sandbox CSP lacks ${directive}`);
}

console.log(`Audited ${totals.files} files (${totals.authored} authored, ${totals.generated} generated, ${totals.assets} assets, ${totals.binary} binary).`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  for (const item of warnings.slice(0, 20)) console.log(`  - ${item}`);
  if (warnings.length > 20) console.log(`  - … ${warnings.length - 20} more`);
}
if (errors.length) {
  console.error(`Audit failed (${errors.length}):`);
  for (const item of errors) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log('Source audit passed.');
}
