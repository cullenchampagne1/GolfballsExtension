# API keys — what the current component does

A brief for redesigning the API keys surface in the Golfballs Toolkit console.
This describes **capability and behaviour only** — what an operator can see,
decide and do — deliberately without prescribing any presentation. Every
visual decision is open.

---

## 1. What this surface is actually about

It manages **installations**, not keys in the abstract.

One entry = one real person's browser with the Golfballs Toolkit extension
installed. When someone installs the extension it enrols itself and receives a
credential; that credential is what the console lists here. So the mental model
for the operator is *"who has the toolkit, and what are they allowed to do with
it"* — the key is the identity, not the subject.

This matters for the redesign: the operator is looking for **a person**, and
the current surface makes them find that person by reading a credential name.

## 2. Two variants exist today

| variant | audience | what it can do |
|---|---|---|
| **API keys** | general console | see installations, turn toolkit access on/off, open per-user settings, revoke |
| **API keys · full admin** | operator | everything above, plus Help Companion access, an all-installations master switch, and sending a message to an install |

They read the same underlying data. The full-admin variant adds controls and
one extra fact (expiry). A redesign could reasonably collapse these into one
surface with progressive disclosure — the split is historical, not principled.

## 3. What is known about each installation

Everything below is already available per installation. The parenthetical says
where it currently appears — this is the single most useful part of this
document, because **most of it is hidden behind a click today** and you asked
about surfacing things like last activity.

**Identity**
- Installation name (shown up front)
- The person — display name if they've registered, otherwise the literal word
  "Unregistered" (shown up front)
- Whether they are registered at all (hidden)
- Installation id — the full credential id, copyable; it's what gets pasted
  into Settings → Email Relay Service to route incoming mail to this install
  (hidden; explicitly *not* the secret)
- Key prefix — a short truncated fingerprint like `gbx_…` (shown up front)

**Access**
- Toolkit access on/off (shown, as a control)
- Help Companion access on/off (full-admin only, as a control)
- Whether the install is enrolled in the extension at all (hidden)
- Role and scopes — the permission strings the credential carries (hidden)

**Lifecycle**
- Status: active, revoked, or expired (shown, as a state)
- Created date (hidden)
- **Last used date** (hidden) ← the "last activity" you're after already exists
- Expiry date, or "never" (shown in full-admin only)

**Aggregate**
- A count line: how many are active out of the total, plus whether the global
  master switch is on

> **Redesign note.** Created, last used, registered, role and scopes are all
> loaded and then only revealed on click. Nothing needs to be built to promote
> them — the data is already in the payload.

## 4. What an operator can do

**Per installation**
- **Toggle toolkit access.** Instant, reversible, no confirmation. This is the
  everyday action and it should stay one gesture.
- **Toggle Help Companion access** (full admin). Only offered when the install
  is actually enrolled — otherwise the control is absent rather than disabled.
- **Open per-user settings.** Opens a larger secondary surface showing only the
  settings this person has explicitly changed away from global policy.
- **Send a message** (full admin, enrolled installs only). Composes a
  notification delivered into that person's extension. Needs a title, a body,
  and a tone chosen from information / success / warning / error.
- **Revoke.** Permanent and destructive. Confirms first: *"Permanently revoke
  this API key?"*
- **Open the full detail** for one installation, which is also where the
  copyable installation id lives.

**Across all installations**
- **Master toolkit switch** (full admin). Turns the toolkit on or off for
  *every* installation at once. Confirms first, in deliberately loud wording:
  *"Flip Golfballs Toolkit access for EVERY installation?"*
- **Broadcast a message** (full admin) to every installation, same composer as
  the single-install case.

## 5. States, and how they are decided

Three lifecycle states, derived rather than stored:

- **Active** — not revoked, and either no expiry or an expiry in the future
- **Revoked** — explicitly revoked; terminal
- **Expired** — expiry date has passed

Layered on top, and independent of lifecycle, is whether access is actually
**on**. This is the subtlety worth preserving: access is on only when *both*
the master switch and this install's own switch are on. So an installation can
be perfectly active and still be switched off — either individually or because
someone flipped the global control.

That produces four situations the current design distinguishes:

| situation | current treatment |
|---|---|
| active and access on | normal weight, positive status dot |
| active but access off | de-emphasised, muted dot, controls still available |
| revoked | de-emphasised, negative tag replaces all controls |
| expired | de-emphasised, negative tag replaces all controls |

Two behaviours here are load-bearing and should survive any redesign:

1. **Revoked and expired installations lose their controls entirely.** They are
   not shown greyed out — the controls are replaced by a status. There is no
   way to act on a dead credential.
2. **"Access off" is visually distinct from "revoked."** One is a reversible
   decision, the other is permanent. Today that's carried by dot colour, which
   is a thin signal for a meaningful difference — a good thing to strengthen.

## 6. Live behaviour

- The data refreshes on its own every 15 seconds.
- Every action refreshes the surface immediately on success, so a toggle's
  effect is visible without a manual reload.
- Destructive and global actions confirm first; ordinary toggles never do.

## 7. Honest problems with the current version

Worth having in front of you, since you're rebuilding it:

- **The person is secondary.** The credential name leads; the human's name sits
  beside it. Operators look for people.
- **Last used is hidden**, so there is no way to see at a glance who has
  stopped using the toolkit — arguably the most useful operational question
  this surface could answer.
- **Unregistered installs read as a value, not a gap.** The literal string
  "Unregistered" occupies the same slot a name would.
- **The key prefix is prominent** but is rarely what anyone is looking for.
- **Controls, status and destructive actions share one region**, so revoke sits
  immediately beside an everyday toggle.
- **The master switch is presented as though it were one more installation**,
  which understates that it overrides every entry beneath it.
- **Two variants** exist mainly for historical reasons and drift apart.

## 8. What a replacement must keep

1. Toolkit access stays a single, instant, reversible gesture.
2. Revoke stays confirmed, and stays visually separate from routine controls.
3. The global switch stays unmistakably global, and stays confirmed.
4. Dead credentials (revoked/expired) expose no controls at all.
5. "Switched off" and "revoked" never look alike.
6. The full installation id stays copyable somewhere — it's needed for email
   relay configuration, and people paste it regularly.
7. Help Companion and message controls stay absent — not disabled — for
   installs that aren't enrolled.
8. Whatever is on screen keeps refreshing on its own.

## 9. Fields available for a redesign, at a glance

Sorted by how useful they are likely to be, not by current prominence:

| field | currently |
|---|---|
| Person / display name | visible |
| Last used | **hidden** |
| Toolkit access state | visible (control) |
| Lifecycle status | visible |
| Installation name | visible |
| Registered or not | **hidden** |
| Created | **hidden** |
| Help Companion access | full admin only |
| Expires | full admin only |
| Installation id (copyable) | **hidden** |
| Key prefix | visible |
| Role | **hidden** |
| Scopes | **hidden** |

---

*Generated from the live implementation: the two block definitions in
`.revstack/blocks.py` (`keys`, `keys-admin`) and the payload builders
`_console_keys_table`, `_console_keys_admin` and `_installation_detail` in
`.revstack/routes.py`.*
