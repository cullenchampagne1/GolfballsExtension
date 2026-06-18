# Custom Page Parity — Contact Details

Goal: the custom Contact Details takeover should do **everything** the real CRM
contact page (`Default.aspx?Page=240&customerID=…`) can do. This tracks every
interactive capability of the real page and whether the custom page has it.

Legend: ✅ done · 🟡 partial · ❌ not ported

## Architecture note (read first)
The host CRM page still loads under the takeover, so its `window.*` functions
(e.g. `ShowTaskModal`, `CreateOpportunityModal`, `AddToDoNotCallList`) are
callable. BUT the CRM's own Bootstrap modals render at z≈10050 — **below** our
takeover (z=100000) — so calling them directly opens them hidden behind us.
Two viable strategies per action:
- **(A) Reuse an existing extension modal** (z≥999990, already renders above the
  takeover). Hooks available: `__gbShowCrmCreateContactModal`, `__gbOpenNote`,
  `__gbShowQuickTaskModal`, `__gbShowCallLogModal`, `__gbShowTaskListModal`,
  `__gbOpenSubmitProof`, `__gbOpenEmailPreview`, `__gbOpenTemplate`, etc.
- **(B) Build it natively** in the takeover (inline edit / our own modal) that
  POSTs to the same endpoint / calls the same webservice the CRM function uses.
- **(C)** Call the CRM fn but raise its modal above the takeover (fragile; host
  CSS bleed — avoid unless trivial).

**KEY: most actions need NO HAR.** Many CRM actions are plain `$.ajax` GETs to
documented endpoints in the page's own inline JS (already in the saved HTML).
We just call the same endpoint from the takeover with the page session
(`fetch(..., {credentials:'include'})`). Only modal-driven multi-field saves
might need a HAR to confirm payload shape — and even those expose their
endpoint in the HTML. Endpoints seen so far:
- DNC: `/golfballs/crm/Admin/Contact/{Add,Remove}FromDoNotCallList.ajax?<custID>`
- Task complete: `Task/Get.ajax?<id>` → `Task/Update.ajax?<json taskStatusID=3>`
- Task create: `Task/Create.ajax?<json>` · Opportunity/Lookup/Mailer: same `/crm/Admin/...` family

## Contacts (start here)

### Contact record
- ❌ **Edit contact fields** — CRM `ShowContactModal` / `SaveContact` /
  `SaveContactCallback` (ContactModal). Custom page has `EKV`/`EditToggle` but
  they're **UI-only** (no save). → wire to (A) `__gbShowCrmCreateContactModal`
  in edit mode, or (B) inline EKV → POST SaveContact.
- ❌ **Create contact** — CRM `CreateContactModal`. → (A) `__gbShowCrmCreateContactModal`.
- ❌ **Add to / Remove from Do-Not-Call** — CRM `AddToDoNotCallList` /
  `RemoveFromDoNotCallList`. "Remove from DNC" button is decorative. → (B/C).
- ❌ **Send Email** — Hero button is decorative. → (A) `__gbOpenEmailPreview` /
  `__gbOpenTemplate` (our email pipeline).
- ❌ **Field formatting/validation** parity — `FormatPhoneNumber`, `FormatEmail`,
  `PhoneNumber`, `BlurContact`, `ClearErrorHighlights` (only if we build native edit).

### Account (linked)
- 🟡 **View account** — account link navigates to the account page. ✅
- ❌ **Edit account inline** — CRM DevExpress `InlineEditAccount` /
  `editFormInlineEditAccountSaved`. `AccountInfoCard` edit is UI-only. → (B).
- ❌ **Create & link new account** — CRM `editFormCreateAccountAndLink*`,
  `populateCreateAccountDropdowns`, `AccountNameSelected`. → (B).
- ❌ **Industry / sub-industry pickers** — `getSubIndustries`,
  `initializeIndustrySubIndustry`, `updateSubIndustryOptions` (part of account edit).

## Activity
- ✅ **List activity** (+ type filter).
- ❌ **Add note** (customer & lead) — CRM `ShowCustomerActivityNoteModal` /
  `ShowLeadActivityNoteModal` / `SaveCustomerNote` / `SaveLeadNote`
  (ActivityNoteModal). "Add note" button is decorative. → (A) `__gbOpenNote` or (B).
- ❌ **View activity detail** — CRM `CreateActivityDetailModal` (ActivityDetailModal).
  Activity rows aren't clickable. → (B) detail drawer/modal.

## Tasks
- ✅ **List tasks** (open + completed).
- 🟡 **Quick add task** — wired to `__gbShowQuickTaskModal`. (Confirm it writes
  back / refreshes vs CRM `QuickAddTask` + `InsertTaskRow`.)
- ❌ **Create task (full)** — CRM `CreateTaskModal` / `SaveTask` /
  `SaveTaskWebservice` (EditTaskModal).
- ❌ **Edit / view task** — CRM `ShowTaskModal` / `UpdateTaskRow`. Task rows not clickable.
- ❌ **Complete task** — CRM `QuickComplete` / `Strikethrough` / `EnableCompleteBtn`.
  No complete checkbox/action on task rows. → (B) call QuickComplete + optimistic strike.

## Opportunities
- 🟡 **View opportunity** — row navigates via `oppHref` to the CRM page. The real
  page uses a **modal** `ShowOpportunityModal` / `ShowOpportunity` / `ShowEvent`.
- ❌ **Create opportunity** — CRM `CreateOpportunityModal` / `CreateNewOpportunity`
  / `SaveOpportunity` / `InsertOpportunityRow` (OpportunityModal). → (B).
- ❌ **Edit opportunity + event/information** — `UpdateOpportunityRow`,
  `editFormOpportunityInformationSaved`, `ClearOpportunityEventData`.

## Mailer
- 🟡 **Mailer status** shown in stats. 
- ❌ **Contact mailer subscription** — CRM `CreateContactMailerkModal`
  (ContactMailerModal). → (B).
- ❌ **Snooze mailer** — CRM `CreateSnoozeMailerModal` / `UpdateSnoozeTime`
  (SnoozeMailerModal). → (B).

## Lookups (alt customer numbers / cross-references)
- ❌ **List / add / delete lookups** — CRM `SaveLookup` / `SaveLookupCallback` /
  `DeleteLookup` / `ClearLookupFields` (NewLookupModal). Not shown at all. → add a
  Lookups panel + native add/delete (B).

## Orders / Items / Emails / Proofs
- ✅ Orders list, Top Items (sorted), Emails list (open/download), Proofs
  (thumbnail, status, PDF/ball/apparel, copy image, click → history).
- ❌ **New order / order entry** — CRM nav `Default.aspx?Page=128&customerID=…`.
  Not surfaced as an action. → simple nav (easy).

## Already ported (for reference)
- ✅ Full read-only render of all sections from the live engine.
- ✅ Navigation: sidebar pages, account, opportunity, search (InlineSearch), proof history.
- ✅ Theme selector. ✅ Log Call (`__gbShowCallLogModal`). ✅ Quick Task (`__gbShowQuickTaskModal`).
- ✅ Proof: PDF / ball / apparel / copy-image / view-history.

## Suggested order of work
1. **Contact edit + create** (A: `__gbShowCrmCreateContactModal`) + **DNC toggle**.
2. **Add note** (A: `__gbOpenNote`) + **Send Email** (A: `__gbOpenEmailPreview`).
3. **Tasks**: full create/edit/complete (wire row clicks + complete action).
4. **Opportunities**: create/edit (native modal).
5. **Account inline edit / create+link**.
6. **Mailer** subscribe/snooze, **Lookups** panel, **New order** nav.
