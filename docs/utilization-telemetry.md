# Extension utilization telemetry

This document is the source-of-truth inventory for the Golfballs Sales Toolkit utilization data. The telemetry is designed to answer whether existing tools are being used, where email activity starts, and how far users move through important workflows without collecting the business content involved.

The dashboard now displays only stored telemetry. There is no generated example-data fallback: an empty chart means no qualifying real events have arrived in the selected period.

## What is tracked

### Feature utilization

| Dashboard event | What increments it | Count meaning | Source / transport dimensions | Flush behavior |
| --- | --- | --- | --- | --- |
| Email deliveries | Power Automate confirms a send, or the extension successfully opens an Outlook `mailto` compose window | One delivered or handed-off message | Entry point: Popup, Task List, CRM Search, Email Preview, Contact, or Other. Transport: Power Automate or Outlook handoff | Coalesced and sent in the periodic batch |
| Email previews | A user opens the email-preview surface | One preview open | Email Preview | Coalesced and sent in the periodic batch |
| Contacts imported | A spreadsheet is parsed and accepted records are loaded into CRM Search | Number of accepted records, not number of files | CRM Search | Flush requested about 1.5 seconds after success |
| Proofs submitted | A real, non-mock submission returns at least one successful proof link | Number of successful proof requests | Submit Proof | Flush requested about 1.5 seconds after success |
| Catalog opens | The Gifting Catalog mounts | One catalog open | Gifting Catalog | Coalesced and sent in the periodic batch |
| Catalog searches | A trimmed catalog search of at least two characters remains unchanged for 1.2 seconds; slash category commands are excluded | One settled search | Gifting Catalog | Coalesced and sent in the periodic batch |
| Products added | A product is added to the working proposal | One add action | Gifting Catalog | Coalesced and sent in the periodic batch |
| Proposals saved | A proposal draft finishes saving successfully | One saved proposal | Gifting Catalog | Flush requested about 1.5 seconds after success |
| Proposals published | Saving a proposal to a CRM opportunity succeeds | One published proposal | Gifting Catalog | Flush requested about 1.5 seconds after success |
| Proposal emails opened | A user enters the catalog's proposal-email builder | One builder open | Gifting Catalog | Coalesced and sent in the periodic batch |
| Checkouts opened | A user enters the catalog checkout builder | One checkout open | Gifting Catalog | Coalesced and sent in the periodic batch |

Only successful feature rows (`ok = true`) enter the utilization chart and detail table. Email mock runs explicitly opt out of reporting. Failed email deliveries, failed imports, all-failed proof submissions, failed proposal saves, and failed publishes do not inflate utilization.

### Email composition dimensions

Every qualifying email delivery contributes the following aggregate-only values:

- `count`: one message.
- `word_count`: words in the rendered/authored message body. The stored email signature is excluded because it is appended after this measurement.
- `attachment_count`: `1` when the message contains one or more non-inline file attachments; otherwise `0`.
- `inline_image_count`: `1` when the message contains one or more inline images; otherwise `0`.
- `source`: the extension entry point that initiated the message.
- `transport`: `pa` for a confirmed Power Automate send or `mailto` for a successful Outlook compose handoff.

The attachment and inline-image values count messages containing those properties, not the number of individual files or images. This makes the chart answer questions such as “how many sent emails included a file?” without retaining file metadata.

### Surface adoption and dwell time

An open event is recorded when a tracked surface becomes visible. A matching close event contains only its elapsed duration. The Adoption block reports open counts and average completed dwell time; a surface that remains open contributes an open immediately and contributes dwell only after it closes.

Tracked surfaces are:

- Toolbar Popup
- CRM Search
- Create Contact
- Call Log
- Quick Task
- Quick Task Popover
- Task List
- Watch List
- Submit Proof
- Image Preview
- Notifications
- Email Preview
- Text Preview
- Gifting Catalog
- Logo Align
- Proposal Email
- Gifting Checkout
- Margin Calculator
- Mockup Studio
- Order Calendar
- Workflow Manager
- Quick Order Note
- Actions Shelf
- Query Builder
- Charge Customer
- Order Edit

New floating modals automatically pass through the shared mount boundary. If a host is not yet in the display-name registry, its fixed host ID is reported visibly instead of silently discarded.

### Presence

The service worker submits a batch once per minute even when it contains no events. That authenticated empty batch is the installation heartbeat. The backend maintains one session row containing its start time, last-seen time, most recently opened surface, latest average batch latency, accepted event count, and locally dropped-event count.

The Active Sessions block treats a session as live when it has reported within five minutes. It shows the installation owner, latest surface, session age, recent latency, current count, and peak hourly concurrency over the prior 24 hours.

### Backend response time

Authenticated extension API round trips are timed in the browser so the measure includes the network wait users experience. Both successful and failed requests produce a latency sample. The held-open notification poll is excluded because its duration is intentional wait time, and the telemetry request itself is excluded to avoid recursively measuring telemetry.

The Response Time block displays p50, p95, and p99, a 20-bucket p95 trend, sample count, and p95 change versus the preceding equal-length window.

## How events reach the backend

1. Workflow code emits a fixed, content-free event to the extension service worker.
2. The worker validates it against closed feature, source, transport, event-kind, and surface-kind vocabularies.
3. Ordinary surface and latency events enter a bounded 240-event buffer. Feature events are coalesced by `feature + source + transport + success` into at most 96 buckets, summing their numeric aggregates.
4. Pending state is persisted in `chrome.storage.session`, so Chrome service-worker eviction does not erase the current batch.
5. One authenticated POST is made every minute. Important, low-frequency success events can request the same batch about 1.5 seconds later instead.
6. The backend validates the same strict shape, updates the session heartbeat, stores content-free event rows, and removes rows older than 365 days.

If the local buffers overflow, the worker retains the newest ordinary events and records how many were dropped. A failed telemetry POST is intentionally best-effort: it never blocks the user's workflow and does not grow an unbounded retry queue. This means utilization is operational telemetry, not an auditable billing ledger.

## Dashboard reporting

The Tool Utilization chart offers 30-day, 90-day, and 1-year ranges and these switchable views:

| View | Lines |
| --- | --- |
| Email sends | Successful messages by Popup, Task List, CRM Search, Email Preview, Contact, and Other |
| Email transport | Power Automate versus Outlook handoff |
| Email words | Total body words by email entry point |
| Email attachments | Messages containing a file, by email entry point |
| Email inline images | Messages containing an inline image, by email entry point |
| Core tools | Email previews, contacts imported, proofs submitted, and catalog opens |
| Catalog workflow | Opens, searches, products added, proposals saved, proposals published, proposal-email builder opens, and checkout opens |

The Utilization Details table aggregates the same successful data by feature, source, and transport, with totals for uses, words, messages with files, and messages with inline images. Both blocks refresh every two minutes. Chart series colors are derived by the dashboard from its active primary theme color.

## Privacy boundary

The telemetry contract has no field for and does not store:

- Recipient or sender addresses
- Email subjects or body content
- Contact, account, opportunity, order, or case identifiers
- Search queries
- URLs or page locations
- File names, file URLs, image URLs, or attachment contents
- Proposal contents, product identities, prices, or quantities

The backend rejects extra fields instead of ignoring them. Timestamps from a browser are clamped to the current time and the 365-day retention horizon. The live guide sets `__gbUsageSilent`, so demonstrations do not count as real adoption.

## Code ownership

- Feature event vocabulary and email measurements: `src/lib/usageEvents.js`
- React surface lifecycle: `src/lib/usageTelemetry.js` and `src/lib/mountFloating.js`
- Surface display-name registry: `src/lib/usageSurfaces.js`
- Vanilla overlay lifecycle: `src/vanilla/usage-report.js`
- Worker batching and coalescing: `lib/usage-telemetry.js`
- Authenticated ingestion and strict validation: `.revstack/logic/client_api.py`
- Dashboard aggregation: `.revstack/routes.py`
- Dashboard block registrations: `.revstack/blocks.py`
- Durable database schema: `revstack-backend/models/AuthModels.py` and migration `0027_extension_usage_telemetry.py`

When a new event is added, update the closed vocabularies in the content helper, worker reporter, backend validation model, chart labels/groups, tests, and this document together.
