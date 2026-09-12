/**
 * Generate Golfballs' installation-settings action inside the local RevStack
 * block. The dashboard renders only the generic YAML form vocabulary; this
 * project owns the registry-to-field mapping and the request contract.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FEATURE_DEFAULTS, FEATURE_FLAG_META } from '../src/lib/flags.js';
import { ADMIN_ONLY } from './strip-admin.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const blockPath = path.join(root, '.revstack/blocks/analytics-scorecard.block.yaml');
const adminKeys = new Set(ADMIN_ONLY.configKeys || []);
const features = FEATURE_FLAG_META.filter(
  ({ key }) => !adminKeys.has(key) && Object.hasOwn(FEATURE_DEFAULTS, key),
);

const tabFor = (section) => (
  section === 'Tools' || section === 'Integration' ? 'Tools & Integration' : section
);
const tabs = [
  'Email & Templates', 'CRM & Contacts', 'Orders & Pricing',
  'Tools & Integration', 'Developer',
];
const yamlText = (value) => JSON.stringify(String(value));
const fieldId = (index) => `feature_${String(index + 1).padStart(2, '0')}`;

const footerArgs = features.map((_, index) => (
  [
    `          ${fieldId(index)}: \"\${data.settings.${fieldId(index)}}\"`,
    `          ${fieldId(index)}_global: \"\${data.settings.${fieldId(index)}_global}\"`,
  ]
)).flat();
const footer = [
  '      - action: open-settings',
  '        label: Open per-user settings',
  '        note: Edit this installation without leaving the scorecard',
  '        args:',
  '          key_id: "${data.id}"',
  '          name: "${data.name}"',
  ...footerArgs,
  '          developer_section: "${data.settings.developer_section}"',
  '          developer_overrides: "${data.settings.developer_overrides}"',
  '        when: ${data.alive}',
].join('\n');

const fields = features.flatMap((feature, index) => [
  `      - id: ${fieldId(index)}`,
  '        type: segmented',
  `        label: ${yamlText(feature.name || feature.key)}`,
  `        description: ${yamlText(`${feature.desc || ''} Global value: \${args.${fieldId(index)}_global}.`)}`,
  '        span: 12',
  `        default: \${args.${fieldId(index)}}`,
  '        options:',
  '          - { value: inherit, label: Inherit }',
  '          - { value: on, label: On }',
  '          - { value: off, label: Off }',
  `        tab: ${yamlText(tabFor(feature.section || 'Tools'))}`,
]);
const featureBody = features.map((feature, index) => (
  `          ${feature.key}: \${form.${fieldId(index)}}`
));
const action = [
  '  open-settings:',
  '    kind: form',
  '    label: Per-user settings',
  '    request:',
  '      method: POST',
  '      url: /projects/golfballs-extension/installation-settings',
  '      body:',
  '        key_id: ${args.key_id}',
  '        features:',
  ...featureBody,
  '        developer_section: ${form.developer_section}',
  '        developer_overrides: ${form.developer_overrides}',
  '    invalidates: [primary]',
  '    form:',
  '      id: installation_settings',
  '      shell: drawer',
  '      size: xl',
  '      tone: accent',
  '      eyebrow: INSTALLATION SETTINGS',
  '      title: ${args.name}',
  '      description: Set explicit differences from global policy. Inherit follows future global changes.',
  '      submit_label: Save changes',
  `      tabs: [${tabs.map(yamlText).join(', ')}]`,
  '      fields:',
  ...fields,
  '      - id: developer_section',
  '        type: segmented',
  '        label: Developer settings section',
  '        description: Show or hide the Developer Settings section for this installation.',
  '        span: 12',
  '        default: ${args.developer_section}',
  '        options:',
  '          - { value: inherit, label: Inherit }',
  '          - { value: shown, label: Shown }',
  '          - { value: hidden, label: Hidden }',
  '        tab: Developer',
  '      - id: developer_overrides',
  '        type: kv_editor',
  '        label: Developer setting overrides',
  '        description: Only explicit overrides are listed. Remove a row to inherit that setting again.',
  '        span: 12',
  '        default: ${args.developer_overrides}',
  '        add_label: + Add developer override',
  '        tab: Developer',
].join('\n');

let source = await readFile(blockPath, 'utf8');
const footerPattern = /      - action: open-settings\n[\s\S]*?(?=      # Only for)/;
const actionPattern = /  open-settings:\n[\s\S]*?(?=\n  # The first `form` action)/;
if (!footerPattern.test(source) || !actionPattern.test(source)) {
  throw new Error('Could not locate the installation settings action in analytics-scorecard.block.yaml');
}
const next = source
  .replace(footerPattern, `${footer}\n`)
  .replace(actionPattern, action);
await writeFile(blockPath, next, 'utf8');
console.log(`Wrote ${features.length} feature controls and the developer override editor.`);
