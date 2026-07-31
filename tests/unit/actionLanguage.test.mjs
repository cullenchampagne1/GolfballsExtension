import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionLanguageCommands,
  normalizeActionPayload,
  serializeActionPayload,
  toAssistantAction,
} from '../../src/lib/actionLanguage.js';

const BATCH_ID = `batch_${'a'.repeat(32)}`;

describe('extension action language', () => {
  it('round-trips feature and settings-share commands across every surface', () => {
    const feature = normalizeActionPayload({
      version: 1,
      command: 'set_feature',
      target: 'emailPreviewEnabled',
      value: false,
      options: [],
      label: 'Turn off Email Preview',
    });
    assert.equal(feature.command, 'set_feature');
    assert.equal(feature.value, false);
    assert.deepEqual(
      normalizeActionPayload(serializeActionPayload(feature)),
      feature,
    );

    const share = toAssistantAction({
      version: 1,
      command: 'share_settings',
      target: 'settings',
      value: 'Settings for David',
      options: ['settings-appearance', 'settings-preferences'],
      label: 'Create settings link',
    }, { receiptId: 'act_1234' });
    assert.equal(share.type, 'share_settings');
    assert.equal(share.receiptId, 'act_1234');
    assert.equal(normalizeActionPayload(share).value, 'Settings for David');
  });

  it('adapts pre-language batch and contact payloads into v1 targets', () => {
    const batch = normalizeActionPayload({
      label: 'Open gallery',
      payload: JSON.stringify({
        command: 'open_mockup_batch',
        batch_id: BATCH_ID,
      }),
    });
    assert.equal(batch.version, 1);
    assert.equal(batch.command, 'open_mockup_batch');
    assert.equal(batch.target, BATCH_ID);

    const contact = normalizeActionPayload({
      type: 'open_contact',
      arguments: {
        contact_email: 'person@example.com',
        message_id: 'message-12',
      },
    });
    assert.equal(contact.target, 'person@example.com');
    assert.equal(contact.value, 'message-12');
  });

  it('understands the email-relay open_contact wire shape verbatim', () => {
    // The exact envelope revstack-email-relay emits for an incoming reply
    // (email_relay_service._enqueue_extension_notification): a { label, payload }
    // wrapper whose payload is a JSON string. If normalize ever stops unwrapping
    // this, canExecute() fails and the notification shows "not available on this
    // page" before any contact search runs.
    const action = normalizeActionPayload({
      label: 'Open contact',
      payload: JSON.stringify({
        version: 1,
        command: 'open_contact',
        target: 'jane.customer@example.com',
        value: 'AAMkAGI2-power-automate-id',
        options: [],
      }),
    });
    assert.equal(action.command, 'open_contact');
    assert.equal(action.target, 'jane.customer@example.com'); // the sender email → click-time search query
    assert.equal(action.value, 'AAMkAGI2-power-automate-id');
    assert.equal(action.label, 'Open contact');
  });

  it('rejects unknown commands, extra fields, and misleading wrappers', () => {
    assert.throws(
      () => normalizeActionPayload({
        version: 1,
        command: 'run_javascript',
        target: 'document.body.remove()',
      }),
      /not registered/,
    );
    assert.throws(
      () => normalizeActionPayload({
        version: 1,
        command: 'set_feature',
        target: 'emailPreviewEnabled',
        value: false,
        options: [],
        script: 'alert(1)',
      }),
      /Unsupported action payload field/,
    );
    assert.throws(
      () => normalizeActionPayload({
        type: 'set_feature',
        target: 'emailPreviewEnabled',
        value: 'false',
        options: [],
        payload: JSON.stringify({
          version: 1,
          command: 'set_feature',
          target: 'actionsShelfEnabled',
          value: false,
          options: [],
        }),
      }),
      /does not match its payload target/,
    );
  });

  it('publishes the current command vocabulary from one registry', () => {
    const commands = actionLanguageCommands();
    for (const command of [
      'set_feature', 'set_setting', 'share_settings',
      'share_email_template', 'open_mockup_batch', 'open_contact',
    ]) {
      assert.ok(commands.includes(command), `${command} must be registered`);
    }
  });
});
