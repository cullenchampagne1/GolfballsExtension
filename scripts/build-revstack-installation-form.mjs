/**
 * Generate Golfballs' installation-settings action inside the local RevStack
 * block. The dashboard renders the generic `setting_grid`; this project owns
 * its registry keys, labels, types, defaults, and request contract.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FEATURE_DEFAULTS, FEATURE_FLAG_META } from '../src/lib/flags.js';
import { DEV_SETTINGS, defaultDevSettings, isValueSetting } from '../src/lib/devSettings.js';
import { ADMIN_ONLY } from './strip-admin.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const blockPath = path.join(root, '.revstack/blocks/analytics-scorecard.block.yaml');
const adminKeys = new Set(ADMIN_ONLY.configKeys || []);
const features = FEATURE_FLAG_META.filter(
  ({ key }) => !adminKeys.has(key) && Object.hasOwn(FEATURE_DEFAULTS, key),
);
const developerDefaults = defaultDevSettings();
const developerSettings = DEV_SETTINGS.filter(
  (setting) => isValueSetting(setting) && !adminKeys.has(setting.key),
);

const groups = [
  { id: 'features_email', tab: 'Email & Templates', sections: ['Email & Templates'] },
  { id: 'features_crm', tab: 'CRM & Contacts', sections: ['CRM & Contacts'] },
  { id: 'features_orders', tab: 'Orders & Pricing', sections: ['Orders & Pricing'] },
  { id: 'features_tools', tab: 'Tools & Integration', sections: ['Tools', 'Integration'] },
];
const yamlText = (value) => JSON.stringify(String(value));
const yamlScalar = (value) => JSON.stringify(value);

function settingLines(setting, { feature = false } = {}) {
  const type = feature ? 'boolean' : setting.type === 'bool' ? 'boolean' : setting.type;
  const lines = [
    `          - key: ${yamlText(setting.key)}`,
    `            label: ${yamlText(feature ? (setting.name || setting.key) : setting.label)}`,
    `            description: ${yamlText(feature ? (setting.desc || '') : (setting.desc || ''))}`,
    `            value_type: ${type}`,
    `            default: ${yamlScalar(feature ? FEATURE_DEFAULTS[setting.key] : developerDefaults[setting.key])}`,
  ];
  if (setting.min !== undefined) lines.push(`            min: ${setting.min}`);
  if (setting.max !== undefined) lines.push(`            max: ${setting.max}`);
  if (setting.step !== undefined) lines.push(`            step: ${setting.step}`);
  if (setting.unit) lines.push(`            unit: ${yamlText(setting.unit)}`);
  if (setting.options) {
    lines.push('            options:');
    for (const option of setting.options) {
      lines.push(`              - { value: ${yamlScalar(option.value)}, label: ${yamlText(option.label || option.value)} }`);
    }
  }
  return lines;
}

const footer = [
  '      - action: open-settings',
  '        label: Open per-user settings',
  '        note: Edit this installation without leaving the scorecard',
  '        args:',
  '          key_id: "${data.id}"',
  '          name: "${data.name}"',
  ...groups.map(({ id }) => `          ${id}: "\${data.settings.${id}}"`),
  '          developer: "${data.settings.developer}"',
  '        when: ${data.alive}',
].join('\n');

const fields = groups.flatMap((group) => [
  `      - id: ${group.id}`,
  '        type: setting_grid',
  '        span: 12',
  '        columns: 2',
  `        default: \${args.${group.id}}`,
  `        tab: ${yamlText(group.tab)}`,
  '        settings:',
  ...features
    .filter((feature) => group.sections.includes(feature.section))
    .flatMap((feature) => settingLines(feature, { feature: true })),
]);

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
  ...groups.map(({ id }) => `          ${id}: \${form.${id}}`),
  '        developer: ${form.developer}',
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
  `      tabs: [${[...groups.map(({ tab }) => tab), 'Developer'].map(yamlText).join(', ')}]`,
  '      fields:',
  ...fields,
  '      - id: developer',
  '        type: setting_grid',
  '        span: 12',
  '        columns: 2',
  '        default: ${args.developer}',
  '        tab: Developer',
  '        settings:',
  '          - key: developer_section',
  '            label: Developer settings section',
  '            description: Show or hide the Developer Settings section for this installation.',
  '            value_type: select',
  '            default: shown',
  '            options:',
  '              - { value: shown, label: Shown }',
  '              - { value: hidden, label: Hidden }',
  ...developerSettings.flatMap((setting) => settingLines(setting)),
].join('\n');

let source = await readFile(blockPath, 'utf8');
const footerPattern = /      - action: open-settings\n[\s\S]*?(?=      # Only for)/;
const actionPattern = /  open-settings:\n[\s\S]*?(?=\n  # The first `form` action)/;
if (!footerPattern.test(source) || !actionPattern.test(source)) {
  throw new Error('Could not locate the installation settings action in analytics-scorecard.block.yaml');
}
source = source
  .replace(footerPattern, `${footer}\n`)
  .replace(actionPattern, action);
await writeFile(blockPath, source, 'utf8');
console.log(`Wrote ${features.length} features and ${developerSettings.length} developer settings.`);
