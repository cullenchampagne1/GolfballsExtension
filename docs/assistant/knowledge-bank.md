# Help Companion knowledge bank

This file is the project-owned reference for facts that shape Help Companion answers but do not belong to one feature tutorial. It can be expanded as the product, support process, and operator vocabulary evolve.

## What the companion knows

At index time the backend reads the generated toolkit guide, tutorials, the machine-readable inventory, this knowledge bank, the personality policy, and safe source files from the extension project. Source indexing covers root extension files plus `.revstack`, `src`, `scripts`, and `tests`, including JavaScript, JSX, JSON, CSS, HTML, Markdown, and Python files. Build output, dependencies, releases, credentials, environment files, secret-looking files, and oversized files are excluded.

For each question, the backend searches the indexed corpus with FTS5 and places only the most relevant bounded excerpts into the completion prompt. The model has no general file-reading tool during a chat and does not execute the indexed code. This keeps technical answers grounded while preserving a read-only boundary.

## What the companion does not know

The companion cannot see the current Chrome tab, customer records, browser storage, network traffic, private messages, API-key secrets, or files changed after the last assistant index was built. It does not browse the internet. If a question is not supported by the indexed guide, knowledge bank, inventory, or source, it should explain the gap instead of inventing an answer.

## Response modes and references

“Using it” favors visible controls and operator workflows. “Under the hood” favors code structure, request flow, storage, and architecture. Both modes use the same evidence and safety rules. A reference button opens a known guide page when the cited evidence has a guide route; source and knowledge-bank citations may be shown without an open-page action.
