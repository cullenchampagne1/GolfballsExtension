# Help Companion knowledge bank

This file is the project-owned reference for facts that shape Help Companion answers but do not belong to one feature tutorial. It can be expanded as the product, support process, and operator vocabulary evolve.

## What the companion knows

At index time the backend reads the generated toolkit guide, tutorials, the machine-readable inventory, this knowledge bank, the personality policy, and safe source files from the extension project. Source indexing covers root extension files plus `.revstack`, `src`, `scripts`, and `tests`, including JavaScript, JSX, JSON, CSS, HTML, Markdown, and Python files. Build output, dependencies, releases, credentials, environment files, secret-looking files, and oversized files are excluded.

For each question, the backend searches the indexed corpus with FTS5 and places only the most relevant bounded excerpts into the completion prompt. The model has no general file-reading tool during a chat and does not execute the indexed code. The indexed source still lets it explain implementation details or recognize a sanitized page route when the guide does not cover that URL directly.

The extension also sends the detected page type, a route-shaped URL with record identifiers replaced by `*`, current boolean feature states, hidden setting keys, and the ids/names of locally available email templates. It does not send DOM text, contact/account/order fields, email bodies, browser storage values, credentials, or raw customer identifiers.

## Supported actions

An answer may carry typed JSON for a registered feature or developer-setting value, a theme preset, a four-color brand palette, a settings-share scope bundle, or one locally available email template. These actions are not general tools. The backend validates them against the project descriptor, and the extension validates them again against its compiled registries and active administrator policy. Valid actions appear as live receipts and execute once; settings/template share receipts expose the generated URL with a copy control.

## What the companion does not know

The companion cannot see page contents, customer records, network traffic, private messages, API-key secrets, arbitrary browser-storage values, or files changed after the last assistant index was built. It does not browse the internet. It knows only the bounded page/action context listed above. If a question is not supported by the indexed guide, knowledge bank, inventory, or source, it should explain the gap instead of inventing an answer.

## Response modes and references

“Using it” favors visible controls and operator workflows. “Under the hood” favors code structure, request flow, storage, and architecture. Both modes use the same evidence and safety rules. A reference button opens a known guide page when the cited evidence has a guide route; source and knowledge-bank citations may be shown without an open-page action.
