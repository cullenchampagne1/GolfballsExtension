# Help Companion knowledge bank

This file is the project-owned reference for facts that shape Help Companion answers but do not belong to one feature tutorial. It can be expanded as the product, support process, and operator vocabulary evolve.

## What the companion knows

At index time the backend reads the generated toolkit guide, tutorials, the machine-readable inventory, this knowledge bank, the personality policy, and safe source files from the extension project. Source indexing covers root extension files plus `.revstack`, `src`, `scripts`, and `tests`, including JavaScript, JSX, JSON, CSS, HTML, Markdown, and Python files. Build output, dependencies, releases, credentials, environment files, secret-looking files, and oversized files are excluded.

For each question, the backend searches the indexed corpus with FTS5 and places only the most relevant bounded excerpts into the completion prompt. The model has no general file-reading tool during a chat and does not execute the indexed code. The indexed source still lets it explain implementation details or recognize a sanitized page route when the guide does not cover that URL directly.

The extension also sends the detected page type, a route-shaped URL with record identifiers replaced by `*`, current boolean feature states, and hidden setting keys. It does not disclose locally saved email-template names or ids during an ordinary question. If the companion needs templates to complete an explicit share request, it returns a bounded `request_data_access` action. The extension displays the requested filter, template type, fields, and result limit; only after the user chooses **Allow once** does the extension filter its own storage and send the approved projection in a continuation. Metadata access includes ids, names, types, and subjects. Body text is included only when the visible request explicitly asks for content access. The approval receipt is local and idempotent, so reopening the conversation cannot resubmit that data.

It never sends DOM text, contact/account/order fields, credentials, raw customer identifiers, or arbitrary browser-storage values through this approval flow.

## Supported actions

An answer may carry typed JSON for a registered feature or developer-setting value, a theme preset, a four-color brand palette, a settings-share scope bundle, an approved email template, a one-time local-data request, or a support ticket. Reports that something is broken should first receive likely checks and focused clarifying questions. They become `bug` tickets only after the user explicitly asks to file them; the ticket should include the confirmed symptom and troubleshooting already attempted. Explicit new-capability requests can become `feature` tickets after the same filing consent. A ticket remains a visible preview until the user presses Submit; merely rendering or restoring its receipt must never send it. Clients that do not advertise this confirmation capability cannot receive executable ticket actions. The receipt returns a public `GBT-…` id, and Settings shows the ticket's status plus administrator replies. Ticket submission is idempotent, so retrying a lost response cannot create a duplicate.

These actions are not general tools. The backend validates them against the project descriptor, adds a unique action receipt id, and the extension validates them again against its compiled registries and active administrator policy. Valid actions appear as live receipts and execute once; settings/template share receipts expose the generated URL with a copy control. Receipt results are stored locally. Legacy messages without a server receipt are assigned a deterministic local historical receipt and are never executed, so restoring an old chat is display-only.

## Theme language

Users do not need to know a preset name. Match natural appearance requests to the live theme registry: Dark is neutral charcoal; Slate (`midnight`) is deep blue-gray; Nord is cool muted blue; Dracula is dark purple and pink; Tokyo Night (`tokyo`) is dark navy and violet; Rosé (`rose`) is warm pink; Cream is warm light; and Light is neutral light. When the user gives a broad style such as “something dark,” choose the closest registered preset and say which one the action uses. A requested accent color is a separate four-color `set_theme_palette` action layered after the preset, so “dark with yellow accents” means a dark preset plus a derived yellow brand palette—not a request for the user to provide hex codes.

An explicit supported change must be command-complete. Never say a feature, setting, theme, or palette was changed unless the matching typed action is present; the client receipt, not the prose answer, reports whether it actually succeeded. If no single registered target can be identified, say that nothing changed and ask one focused clarifying question.

## What the companion does not know

The companion cannot see page contents, customer records, network traffic, private messages, API-key secrets, arbitrary browser-storage values, or files changed after the last assistant index was built. It does not browse the internet. It knows only the bounded page/action context listed above plus any one-time projection the user explicitly approves. For product-specific questions it should explain an evidence gap instead of inventing an answer. Harmless general conversation does not require product evidence and can be answered naturally from general knowledge.

## Response depth and references

The companion uses one continuous conversation and infers the useful answer depth from each question. Workflow questions favor visible controls and expected results; technical questions can use indexed source evidence for code structure, request flow, storage, and architecture. A reference button opens a known guide page when the cited evidence has a guide route; source and knowledge-bank citations may be shown without an open-page action.
