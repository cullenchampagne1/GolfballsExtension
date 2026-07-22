# Help Companion knowledge bank

This file is the project-owned reference for facts that shape Help Companion answers but do not belong to one feature tutorial. It can be expanded as the product, support process, and operator vocabulary evolve.

## What the companion knows

At index time the backend reads the generated toolkit guide, tutorials, the machine-readable inventory, this knowledge bank, the personality policy, and safe source files from the extension project. Source indexing covers root extension files plus `.revstack`, `src`, `scripts`, and `tests`, including JavaScript, JSX, JSON, CSS, HTML, Markdown, and Python files. Build output, dependencies, releases, credentials, environment files, secret-looking files, and oversized files are excluded.

For each question, the backend searches the indexed corpus with FTS5 and places only the most relevant bounded excerpts into the completion prompt. If that first pass is insufficient, the model may return up to three focused evidence searches and the backend performs one additional bounded read-only retrieval round. The model has no general filesystem tool, never executes indexed code, and cannot escape the Golfballs extension project directory. Source citations retain project-relative file paths and exact indexed line ranges so technical answers and support tickets can name the code that informed the diagnosis.

Client data has two buckets. The automatic bucket contains the detected page type, a route-shaped URL with record identifiers replaced by `*`, current registered feature values, current registered developer-setting values, and hidden-setting keys. This low-risk state is sent on each turn so the companion can diagnose configuration without asking the user to approve information the model already needs to answer responsibly. Hidden policy-controlled values are excluded.

The permission bucket contains personal saved content. Registered sources currently include email templates plus quick-note, task, and call-log templates. The model may decide a source would help and return a bounded `request_data_access` action with a local query, subtype/type, metadata/content projection, enabled-state filter, and result limit. The extension shows that exact request; only after the user chooses **Allow once** does it filter Chrome storage locally and send the safe projection in a continuation. Content is included only when the visible request asks for it. Approval receipts are local and idempotent, so reopening a conversation cannot resubmit data.

It never sends DOM text, contact/account/order fields, credentials, raw customer identifiers, or arbitrary browser-storage values through this approval flow.

## Supported actions

An answer may carry typed JSON for a registered feature or developer-setting value, a theme preset, a four-color brand palette, a settings-share scope bundle, an approved email template, a one-time local-data request, or a support ticket. Reports that something is broken should first receive likely checks and focused clarifying questions. They become `bug` tickets only after the user explicitly asks to file them; the ticket should include the confirmed symptom and troubleshooting already attempted. Explicit new-capability requests can become `feature` tickets after the same filing consent. A ticket remains a visible preview until the user presses Submit; merely rendering or restoring its receipt must never send it. Clients that do not advertise this confirmation capability cannot receive executable ticket actions. The receipt returns a public `GBT-…` id, and Settings shows the ticket's status plus administrator replies. Ticket submission is idempotent, so retrying a lost response cannot create a duplicate.

These actions are not general tools. The backend validates them against the project descriptor, adds a unique action receipt id, and the extension validates them again against its compiled registries and active administrator policy. Valid actions appear as live receipts and execute once; settings/template share receipts expose the generated URL with a copy control. Receipt results are stored locally. Legacy messages without a server receipt are assigned a deterministic local historical receipt and are never executed, so restoring an old chat is display-only.

Permission-source access is never silent and a model request is not a grant. A how-to question is not permission to inspect saved content. The companion should use indexed documentation and automatic settings state first, request the narrowest personal-data projection that materially helps, and explain why it needs it in the approval label. A user may decline without breaking the conversation. Creating or sharing a resource still requires an explicit user request for that mutation; merely approving read access does not authorize a link, send, edit, or other write.

## Theme language

Users do not need to know a preset name. Match natural appearance requests to the live theme registry: Dark is neutral charcoal; Slate (`midnight`) is deep blue-gray; Nord is cool muted blue; Dracula is dark purple and pink; Tokyo Night (`tokyo`) is dark navy and violet; Rosé (`rose`) is warm pink; Cream is warm light; and Light is neutral light. When the user gives a broad style such as “something dark,” choose the closest registered preset and say which one the action uses. A requested accent color is a separate four-color `set_theme_palette` action layered after the preset, so “dark with yellow accents” means a dark preset plus a derived yellow brand palette—not a request for the user to provide hex codes.

An explicit supported change must be command-complete. Never say a feature, setting, theme, or palette was changed unless the matching typed action is present; the client receipt, not the prose answer, reports whether it actually succeeded. If no single registered target can be identified, say that nothing changed and ask one focused clarifying question.

## What the companion does not know

The companion cannot see page contents, customer records, network traffic, private messages, API-key secrets, arbitrary browser-storage values, the Documents/monorepo root, or generic RevStack backend infrastructure. It does not browse the internet. Extension source changes require a reindex before they become evidence. It knows only the project-scoped index, automatic state listed above, and one-time projections the user explicitly approves. For product-specific questions it should explain a remaining evidence gap instead of inventing an answer. Harmless general conversation does not require product evidence and can be answered naturally from general knowledge.

## Response depth and references

The companion uses one continuous conversation and infers the useful answer depth from each question. Workflow questions favor visible controls and expected results; technical questions can use indexed source evidence for code structure, request flow, storage, and architecture. A reference button opens a known guide page when the cited evidence has a guide route; source and knowledge-bank citations may be shown without an open-page action.
