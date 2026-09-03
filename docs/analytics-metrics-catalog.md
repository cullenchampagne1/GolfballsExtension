# Extension analytics — metrics catalog & data relationships

Audience: this document is written for **design**, to plan dashboard/UI work, and for
whoever prioritizes the backlog of new tracking. It builds on
[`utilization-telemetry.md`](./utilization-telemetry.md), which stays the source of
truth for the exact contract of what's tracked today — this document adds the
full catalog of *possible* metrics (tracked, trackable-but-not-surfaced, and
not-yet-tracked), how they relate to each other, and what's missing to answer
the actual business question: **"is a given rep using these tools well?"**

## 0. Read this first — the one gap that matters most

Every dashboard that exists today (Presence, Response Time, Top Surfaces, Tool
Utilization, Utilization Details) is a **global aggregate across every
installation**. The underlying event rows already carry an owner
(`owner_credential_id`) on every single row — the data to break any of these
down **by rep is already being collected** — but none of the existing charts
group by it. Today you can see "1,204 catalog searches happened this month"
but not "which reps ran them, and which reps never open the catalog at all."

Closing this gap is mostly a backend query change (`GROUP BY
owner_credential_id` instead of nothing), not new instrumentation — see
[§5](#5-the-per-rep-gap-what-it-takes). Everything in the catalog below is
tagged with whether it's already attributable to a rep today.

There is also no verified "who is this person" identity inside the extension
— see [§2](#2-entities--how-they-relate). Design around **installation** as
the actor, with a self-reported display name, not a login.

## 1. Status legend

| Symbol | Meaning |
| --- | --- |
| ✅ Live | Tracked, stored, and already on a dashboard block today |
| 🟡 Stored, not surfaced | Data is already being written and could be queried, but no chart reads it yet (mostly: anything sliced by rep) |
| 🧩 Stored elsewhere | Real data exists in a different table (product-generation jobs), not the usage-events pipeline — needs its own block |
| 🔴 Gap | No event exists yet; needs new instrumentation in the extension client |
| ⛔ Out of scope | Deliberately excluded (content, or an internal dev-only tool) |

## 2. Entities & how they relate

```mermaid
erDiagram
    INSTALLATION ||--o{ SESSION : "runs"
    INSTALLATION ||--o| INSTALLATION_IDENTITY : "self-declares"
    INSTALLATION ||--o{ EVENT : "generates"
    SESSION ||--o{ EVENT : "batches"
    EVENT }o--o| FEATURE : "performs (kind=feature)"
    EVENT }o--o| SURFACE : "opens/closes (kind=surface_*)"
    INSTALLATION ||--o{ MOCKUP_BATCH : "starts"
    MOCKUP_BATCH ||--o{ MOCKUP_JOB : "contains"
    INSTALLATION ||--o{ ASSISTANT_RUN : "asks"

    INSTALLATION {
        string credential_id PK "= the extension install, NOT a verified person"
        string key_prefix
        datetime created_at
        datetime revoked_at "telemetry outlives this"
        bool extension_enabled
        bool assistant_enabled
    }
    INSTALLATION_IDENTITY {
        string credential_id PK_FK
        string display_name "optional, self-typed in Settings"
        string local_part "email local-part, for PA From"
    }
    SESSION {
        string id PK
        string owner_credential_id FK
        datetime started_at
        datetime last_seen_at "presence rides this"
        string surface "latest surface open"
        int ping_ms
        int events
        int dropped
    }
    EVENT {
        int id PK
        string owner_credential_id FK
        string session_id FK
        string kind "surface_open | surface_close | latency | feature"
        string surface FK
        string surface_kind "modal | page | popup"
        string feature FK
        string source "entry point"
        string transport "pa | mailto | none"
        int count
        int word_count
        int attachment_count
        int inline_image_count
        int duration_ms
        bool ok
        datetime occurred_at
    }
    FEATURE {
        string id PK "closed vocabulary, e.g. gift_catalog_search"
        string label
        string funnel_stage
    }
    SURFACE {
        string id PK "e.g. Gifting Catalog, CRM Search"
        string kind "modal | page | popup"
    }
    MOCKUP_BATCH {
        string id PK
        string owner_credential_id FK
        string status
        int job_count
        datetime created_at
        datetime completed_at
    }
    MOCKUP_JOB {
        string id PK
        string batch_id FK
        string status
        string provider
        datetime completed_at
    }
    ASSISTANT_RUN {
        string id PK
        string owner_credential_id FK
        string status
        int queue_ms
        int elapsed_ms
        datetime created_at
    }
```

**Reading this diagram as a designer:**

- **INSTALLATION** is your "rep" row for every list/leaderboard — but it's a
  Chrome install, not a login. One person on two computers is two rows; two
  people sharing a machine is one row. `INSTALLATION_IDENTITY.display_name` is
  the only human-readable label, and it's optional/self-typed, so plan an
  empty state ("Unregistered install") everywhere you show a name.
- **SESSION** is one open-and-running extension instance. It's the heartbeat
  — it exists (and its `last_seen_at` ticks forward) even if the rep never
  clicks anything, which is what makes "Active now" possible.
- **EVENT** is the one table nearly every metric below comes from. Its
  `kind` column is a discriminator: `surface_open`/`surface_close` rows
  describe **time in a tool**, `feature` rows describe **an action inside a
  tool**, `latency` rows describe **backend responsiveness**. A `feature`
  event always has `feature` + `source` set; a `surface_*` event always has
  `surface` set; they never mix on one row.
- **FEATURE** and **SURFACE** aren't separate database tables — they're
  closed vocabularies (fixed lists) enforced by the extension and the
  backend. Treat them as filter/legend values, not as something with their
  own detail page.
- **MOCKUP_BATCH** / **MOCKUP_JOB** are a completely separate table family
  (already live in the backend for the 3D product-image generation pipeline)
  that also carries `owner_credential_id` — same rep join key, zero events
  wired to it yet.
- **ASSISTANT_RUN** is the AI Help Companion's existing content-free run log
  (status/timing only, never the question asked).

## 3. The metrics catalog

Every metric names its **grain** — the thing one row/point represents — since
that's what determines whether it belongs on a rep scorecard, a team
leaderboard, or a single global trend line.

### A. Adoption & reach

| Metric | Definition | Grain | Status | Source |
| --- | --- | --- | --- | --- |
| Active installs | Distinct installations seen in a window | org · day/week/month | 🟡 | `SESSION.owner_credential_id` distinct |
| Active reps right now | Installs with a session `last_seen_at` inside the last few minutes | org, live | ✅ (Presence block) | `SESSION` |
| New installs | First-ever session per credential | org · day | 🟡 | `SESSION.started_at` min per owner |
| Reps who never open a given tool | Installs with zero `feature`/`surface_open` rows for that surface, ever | per surface | 🔴 needs new query | `EVENT` anti-join |
| Concurrency curve | Distinct sessions alive per hour, last 24h | org · hourly | ✅ (Presence footer) | `SESSION` |

### B. Engagement & time-in-tool

| Metric | Definition | Grain | Status | Source |
| --- | --- | --- | --- | --- |
| Surface opens | Count of `surface_open` events | per surface · day, or **per rep · surface · day** | ✅ global / 🟡 per-rep | `EVENT` where `kind=surface_open` |
| Average dwell time | Mean `duration_ms` on matching `surface_close` | per surface, or per rep · surface | ✅ global / 🟡 per-rep | `EVENT` where `kind=surface_close` |
| Session length | `last_seen_at - started_at` | per session, rollup per rep | 🟡 | `SESSION` |
| Sessions per rep per day | Count of sessions started | per rep · day | 🟡 | `SESSION` |
| Top tools by opens | Ranked surfaces by open count | org · window | ✅ (Top Surfaces block) | `EVENT` |
| Idle/never-used surfaces | Surfaces with near-zero opens in window | org · window | 🟡 (inverse of above) | `EVENT` |
| Actions Shelf usage | Shelf open/close only — **not** which action inside it was clicked | org | ✅ open/close only | `EVENT` |
| Actions Shelf action breakdown | Which of the ~13 shelf actions (`gb-call-contact`, `gb-quick-task`, …) actually gets clicked | org, or per rep | 🔴 | new event needed |

### C. Feature utilization (what reps actually do)

| Metric | Definition | Grain | Status | Source |
| --- | --- | --- | --- | --- |
| Email sends | Count of `email_send`, by entry point + transport | org · day, or **per rep** | ✅ chart / 🟡 per-rep | `EVENT` |
| Email transport mix | Power Automate vs. Outlook mailto handoff share | org · window | ✅ | `EVENT` |
| Email words/attachments/inline-images | Aggregate counts on delivered mail | org · window | ✅ | `EVENT` |
| Email previews opened | `email_preview` count | org, or per rep | ✅ global / 🟡 per-rep | `EVENT` |
| Contacts imported (volume) | `contact_import` accepted-record sum | org · window | ✅ | `EVENT` |
| Import runs (count) | `contact_import_run` derived count | org · window | ✅ | `EVENT` |
| Proofs submitted | `proof_submit` successful count | org, or per rep | ✅ global / 🟡 per-rep | `EVENT` |
| **Gift Catalog funnel**: open → search → add → save → publish → email → checkout | Stage-by-stage counts, same window | org · window, or **per rep** | ✅ chart / 🟡 per-rep | `EVENT` (7 `gift_catalog_*` features) |
| Catalog funnel drop-off | Ratio between adjacent funnel stages | org · window | 🔴 needs a computed view | derived from above |
| Margin Calculator: quotes priced under minimum margin | Times the guardrail warning fires | org, or per rep | 🔴 | new event needed |
| Calendar: successful date pushes | Count of `GB_DATES_PUSHED` outcomes | org, or per rep | 🔴 | new event needed |
| Charge/Refund actions taken | Count + $ bucket (content-free — bucket, not exact amount) | org, or per rep | 🔴 | new event needed |
| Order Edit saves | Count of successful edits | org, or per rep | 🔴 | new event needed |
| Watch List adds / completions | Items added vs. marked complete | per rep | 🔴 | new event needed |
| Workflow Manager runs | Started / completed / recipient count / dry-run vs. live / pause-resume | org, or per rep | 🔴 | new event needed |
| Quick Send batch size & retry rate | Per-batch (not per-message) size, retries, abandon rate | org, or per rep | 🔴 | new event needed |
| 3D viewer usage by product type | Preview/export counts split by model (ball, poker chip, divot tool, bartender tool, marker, tee, gift set) | org, or per rep | 🔴 | new event needed — 7 known model types already exist as settings, just never counted |
| Settings shared / imported | Count of shared-config creates and teammate imports | org | 🔴 | new event needed |
| AI Help Companion: questions asked / actions executed / feedback given | Content-free counts only, never the question text | org, or per rep | 🔴 | new event needed; run status already logged in `ASSISTANT_RUN` |
| Sales Fantasy engagement | Opens, tab switched to, week navigated | per rep | 🔴 | zero instrumentation today — would need `surface_open` wiring added, since it's a separate popup window outside the tracked-surface list |

### D. Mockup Studio (3D product-image generation)

This is the one feature family with **real per-rep data already sitting in a
table**, just not the usage-events one — see `MOCKUP_BATCH` / `MOCKUP_JOB` in
§2. None of it is on a dashboard yet.

| Metric | Definition | Grain | Status |
| --- | --- | --- | --- |
| Batches started | Count of `extension_product_image_batches` rows | per rep · day | 🧩 stored, no block |
| Batch completion rate | `status=completed` / total | per rep, org | 🧩 |
| Jobs per batch | `job_count` distribution | per rep | 🧩 |
| Time to complete a batch | `completed_at - created_at` | per rep, org | 🧩 |
| Provider used | Which generation provider fulfilled the job | org | 🧩 |
| Batch outcome breakdown | completed / partial / failed / cancelled | org · window | 🧩 |

### E. Reliability & performance

| Metric | Definition | Grain | Status |
| --- | --- | --- | --- |
| Response time p50 / p95 / p99 | Percentiles over `latency` event `duration_ms` | org · window | ✅ (Response Time block) |
| p95 trend | 20-bucket spark across the window | org · window | ✅ |
| Error rate | Share of events with `ok = false` | org, or per feature | 🟡 — column exists (`ok`), not surfaced as a rate |
| Dropped-event rate | `SESSION.dropped` vs. `SESSION.events` | org, or per rep | 🟡 |
| Failed proof / import / publish attempts | Same source rows as their successful counterparts, filtered `ok = false` | org · window | 🟡 |

### F. Rep effectiveness — the composite view

These aren't raw counts; they're what "using their time effectively" turns
into once the per-rep gap in §5 is closed. All are **derived** from the
tables above, not new tables.

| Metric | Definition | Depends on |
| --- | --- | --- |
| Actions per active hour | `feature` event count ÷ summed session duration, per rep | B + C, per-rep grouping |
| Time-to-first-action | Minutes from session start to first `feature` event | B + C |
| Tool breadth | Distinct surfaces/features touched per rep per week | C, per-rep grouping |
| Funnel completion rate | Catalog opens that reach `publish`, per rep | C, per-rep grouping |
| Rep vs. team-average dwell | Per-surface dwell compared to the org median | B, per-rep grouping |
| Idle reps | Installs active (sessions exist) but near-zero `feature` events | A + C |

## 4. Feature & surface reference (for legends, filters, icons)

**Feature vocabulary (closed, 11 values today):** `email_send`,
`email_preview`, `contact_import`, `contact_import_run` (derived),
`proof_submit`, `gift_catalog_open`, `gift_catalog_search`,
`gift_catalog_add`, `gift_catalog_proposal_save`, `gift_catalog_publish`,
`gift_catalog_email`, `gift_catalog_checkout`.

**Source / entry-point vocabulary:** Popup, Task List, CRM Search, Email
Preview, Contact, Submit Proof, Gifting Catalog, Other.

**Tracked surfaces (dwell-time capable, ~19 today):** Toolbar Popup, CRM
Search, Create Contact, Call Log, Quick Task (+ Popover variant), Task List,
Watch List, Submit Proof, Image Preview, Notifications, Email Preview, Text
Preview, Gifting Catalog, Margin Calculator, Mockup Studio, Order Calendar,
Workflow Manager, Quick Order Note, Actions Shelf.

**Explicitly out of scope, by design (⛔):** exact email subject/body/
recipient, contact/account/order/case identifiers, search query text,
product identities/prices/quantities, URLs, filenames. The backend rejects
any event payload carrying an unrecognized field, so this boundary is
enforced, not just documented — any new metric proposal has to fit inside
counts/durations/booleans/closed-vocabulary labels, never free text.

**Internal/dev tools — track separately if at all, don't mix into rep
scorecards:** Page Engine Inspector, Email Creation Preview, Guide (demo
components run with tracking silenced on purpose), Mockup Catalog Admin.

## 5. The per-rep gap: what it takes

Every table in §2 already has `owner_credential_id` on every row. Closing the
gap is: (1) add `owner_credential_id` (or `INSTALLATION_IDENTITY.display_name`
via a join) to the `GROUP BY` on the existing Adoption/Latency/Utilization
queries, behind a rep picker or "top N reps" toggle, and (2) decide how to
handle installs with no self-reported display name (fall back to a masked
credential prefix, the same pattern the Presence block already uses).
No new tracking is required for this half of the catalog — it's a read-side
change.

## 6. Suggested screens for design

1. **Org overview** (exists today, rename candidate: "Extension health") —
   Presence, Response Time, Top Surfaces, Tool Utilization chart + Details
   table. All ✅ today.
2. **Rep scorecard** (net-new) — one rep, one page: active hours, tools
   touched, funnel completion, dwell per surface, trend vs. team median.
   Needs §5's grouping change, no new events.
3. **Team leaderboard** (net-new) — the same handful of composite metrics
   from §3F, ranked, for a manager's "who needs a nudge" view. Needs §5.
4. **Gift Catalog funnel** (component exists inside Utilization, could be its
   own screen) — open→search→add→save→publish→email→checkout, with
   drop-off rates once §3C's derived metric is computed.
5. **Mockup Studio activity** (net-new) — batches, completion rate, time-to-
   complete, provider mix. Data exists (§3D), no block built.
6. **Reliability** (component exists inside Response Time) — add error rate
   and dropped-event rate once surfaced (§3E).
7. **Sales Fantasy engagement** (net-new, optional) — only worth building
   once the 🔴 instrumentation in §3C lands; today there is nothing to chart.

## 7. Priority read for whoever scopes the backlog

Highest value, lowest new-instrumentation cost, in order:
1. Per-rep grouping on existing blocks (§5) — no new events, unlocks the
   entire "is this rep using their time well" question the org actually
   asked for.
2. Mockup Studio dashboard block (§3D) — data already exists, purely a new
   read + block.
3. Gift Catalog funnel drop-off rate — pure derived metric off data that
   already exists.
4. New events, roughly in order of how core the workflow is: Workflow
   Manager run outcomes, Calendar date-push outcomes, 3D viewer per-model
   usage, AI Help Companion counts, then the smaller single-action gaps
   (Charge, Order Edit, Watch List, Margin Calculator guardrail, Settings
   sharing, Actions Shelf per-action clicks, Sales Fantasy).
