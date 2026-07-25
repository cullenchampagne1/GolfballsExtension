// One source of truth shared with MV3 importScripts/content-script consumers.
// The classic module installs a frozen API on globalThis; importing it here
// lets Vite/Node use the exact same parser rather than a second implementation.
import '../../lib/action-language.js';

const language = globalThis.GBActionLanguage;

export const ACTION_LANGUAGE_VERSION = language.version;
export const actionLanguageCommands = () => language.commands();
export const hasActionCommand = (command) => language.hasCommand(command);
export const normalizeActionPayload = (value) => language.normalize(value);
export const serializeActionPayload = (value) => language.serialize(value);
export const toAssistantAction = (value, extra) => (
  language.toAssistantAction(value, extra)
);
