import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const ZIP = fileURLToPath(new URL('../../proof-submit-extension.zip', import.meta.url));
const PREFIX = 'proof-submit-extension/';

function unzip(args, options = {}) {
  const result = spawnSync('unzip', args, {
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr?.toString() || result.stdout?.toString());
  return result.stdout;
}

function entry(relative, encoding = 'utf8') {
  return unzip(['-p', ZIP, PREFIX + relative], { encoding });
}

describe('slim proof-toolkit package', () => {
  it('ships a valid v2 manifest with every declared runtime file and model asset', () => {
    const names = new Set(unzip(['-Z1', ZIP]).trim().split('\n'));
    const manifest = JSON.parse(entry('manifest.json'));
    assert.equal(manifest.version, '2.0.0');

    const references = [
      manifest.background.service_worker,
      ...Object.values(manifest.action.default_icon),
      ...manifest.content_scripts.flatMap((script) => script.js || []),
      ...manifest.web_accessible_resources.flatMap((resource) => resource.resources || []),
    ];
    for (const reference of references) {
      assert.ok(names.has(PREFIX + reference), `manifest reference is packaged: ${reference}`);
    }

    for (const bundle of ['email-preview.js', 'image-preview.js', 'submit-proof.js', 'text-preview.js']) {
      assert.ok(names.has(`${PREFIX}react-dist/content/${bundle}`), `${bundle} is packaged`);
    }
    for (const model of [
      'golfball_model/Golf_ball.obj',
      'poker_chip_model/PokerChip.obj',
      'divot_tool_model/DivotTool.obj',
      'bartender_tool_model/BartenderTool.obj',
      'marker_model/BallMarker.obj',
      'giftbox_model/GiftBox.obj',
      'giftbox_model/GiftBox_Lever.obj',
      'giftbox_model/GiftBox_Bartender.obj',
      'giftbox_model/GiftBox_WoodPoker.obj',
      'giftbox_model/GiftBox_WoodLever.obj',
    ]) assert.ok(names.has(`${PREFIX}assets/${model}`), `${model} is packaged`);

    assert.ok(![...names].some((name) => /(?:^|\/)(?:node_modules|\.DS_Store|__MACOSX)(?:\/|$)/.test(name)));
  });

  it('locks white mode and the full ten-model dropdown without delivery automation', () => {
    const theme = entry('src/lib/theme.js');
    const mount = entry('src/lib/mountFloating.js');
    const settings = entry('src/lib/devSettings.js');
    const viewer = entry('src/modals/ImagePreview.jsx');
    const scenes = entry('src/modals/GolfballViewer.jsx');

    assert.match(theme, /document\.documentElement\.dataset\.theme = 'light'/);
    assert.match(mount, /host\.dataset\.theme = 'light'/);
    assert.match(settings, /'imageViewer\.ballChipOnly': false/);

    for (const id of [
      'ball', 'chip', 'divot', 'bartender', 'marker',
      'giftsetPoker', 'giftsetLever', 'giftsetBartender', 'giftsetWoodPoker', 'giftsetWoodLever',
    ]) assert.match(viewer, new RegExp(`id: '${id}'`));

    for (const scene of [
      'golden_gate_hills_2k.exr', 'sunset_fairway_2k.exr',
      'lilienstein_2k.exr', 'moonlit_golf_2k.exr',
    ]) assert.match(scenes, new RegExp(scene.replace('.', '\\.')));

    const readOnlyEmailRuntime = [
      entry('manifest.json'), entry('background.js'),
      entry('src/content/email-preview.jsx'), entry('src/modals/EmailPreview.jsx'),
    ].join('\n');
    assert.doesNotMatch(readOnlyEmailRuntime, /Power Automate|logic\.azure|emailSender|sendEmail/i);
  });

  it('runs the packaged MIME, sanitizer, and chat parsers against realistic fixtures', async () => {
    const temp = mkdtempSync(resolve(tmpdir(), 'proof-submit-package-'));
    try {
      writeFileSync(resolve(temp, 'package.json'), '{"type":"module"}');
      for (const file of ['emailParse.js', 'sanitizeHtml.js', 'parseChat.js']) {
        writeFileSync(resolve(temp, file), entry(`src/lib/${file}`, null));
      }

      const emailParse = await import(pathToFileURL(resolve(temp, 'emailParse.js')).href);
      const parseChat = await import(pathToFileURL(resolve(temp, 'parseChat.js')).href);
      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      globalThis.document = dom.window.document;
      const sanitizer = await import(pathToFileURL(resolve(temp, 'sanitizeHtml.js')).href);

      const raw = [
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        '<p>It=E2=80=99s ready</p>',
      ].join('\r\n');
      assert.equal(emailParse.parseEml(raw).bodyHtml, '<p>It’s ready</p>');
      assert.equal(
        sanitizer.sanitizeHtml('<svg onload="x"><a href="https://x">leak</a></svg><p>safe</p>'),
        '<p>safe</p>',
      );
      assert.deepEqual(
        parseChat.parseChat('(09:14:00) <b>Visitor</b> Hi\n(09:15:00) <b>Alex</b> Hello').messages
          .map((message) => message.kind),
        ['visitor', 'agent'],
      );
      assert.equal(parseChat.safeChatTranscriptUrl('see https://example.com/not-safe'), '');
    } finally {
      delete globalThis.document;
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
