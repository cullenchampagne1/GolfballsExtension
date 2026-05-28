/* ───────────────────────────────────────────────────────────────
   page-schemas/contact.js — unified CRM schema for the Contact
   Details + Account Details pages.

   ONE field tree, TWO page variants
   ──────────────────────────────────
   Both pages render the same Account form (`#Name`, `#MainCity`,
   etc.) and the same set of tables (Orders, Items, Tasks,
   Opportunities, Activities, Emails). The interesting deltas are
   page-shaped:

     • `contact.*` fields — the Contact page exposes them as labels
       (`#lblContactFirstName`); the Account page exposes them as
       cells in the Account Contacts table. The unified schema
       declares the contact fields once and uses `extractByPage` to
       switch the extractor per page.

     • `stats.*` tiles — only the Contact page has them. On the
       Account page the selectors resolve null; `smart.fallback` on
       individual variables can kick in if templates need it.

     • Account-only fields — Last Modified, Tax Exempt, Partner
       Campaign, and the multi-row `contacts[]` array of related
       contacts. These declare default extractors that simply
       resolve null on the contact page (selectors miss).

     • Tasks tables — Contact page uses `#TableTasks` /
       `#TableCompletedTasks`. Account page renders BOTH portlets
       with the SAME id `#TableTasks` (CRM bug); we scope by the
       portlet caption via `openTaskRows` / `completedTaskRows`
       helpers, overridden per page.

   The engine reads `extractByPage[schemaId]` ahead of `extract` at
   walk time — same JSON shape comes out either way; templates and
   the AccountConditions picker don't change.

   Authored from sample HTML:
     • Contact: Golfballs Administration _ .._Modules_CRM_Admin -
       ContactDetails.html
     • Account: Golfballs Administration _ .._Modules_CRM_Admin -
       AccountDetails.html
─────────────────────────────────────────────────────────────── */

/* The field tree is defined once and shared between the two page
   schemas below. Per-page deltas live inside individual `extract`
   blocks via `extractByPage: { account: <override> }` (or
   `{ contact: ... }` when the override is on the contact side). */
const FIELDS = {
  /* ── Stable internal identifiers ───────────────────────────── */
  ids: {
    type: 'object',
    label: 'IDs',
    fields: {
      contact: {
        type: 'string',
        label: 'Contact ID',
        extract: { sel: '#tbContactId', attr: 'value' },
        extractByPage: {
          /* Account pages have no #tbContactId (no current contact);
             surface the FIRST related contact's ID from the table
             link's Page=240 query string so single-contact templates
             still resolve a meaningful customerID on account pages. */
          account: { fn: 'firstAccountContactField', args: ['detailUrl'] },
        },
        validate: { required: true, pattern: /^\d+$/, message: 'expected numeric contact ID' },
      },
      account: {
        type: 'string',
        label: 'Account ID',
        extract: { sel: '#AccountID', attr: 'value' },
      },
      /* Tasks modal carries #tbContactID (capital D) on the contact
         page — different node from #tbContactId. We expose it for
         debugging when they drift; null on the account page since
         no Tasks modal renders the field there. */
      contactAlt: {
        type: 'string',
        label: 'Contact ID (modal)',
        extract: { sel: '#tbContactID', attr: 'value' },
      },
    },
  },

  /* ── Contact info (display + form) ─────────────────────────── */
  contact: {
    type: 'object',
    label: 'Contact',
    fields: {
      firstName: {
        type: 'string',
        label: 'First name',
        extract: { sel: '#lblContactFirstName', attr: 'innerText' },
        extractByPage: {
          account: { fn: 'firstAccountContactField', args: ['firstName'] },
        },
        transform: 'trim',
        validate: { required: true },
      },
      middleInitial: {
        type: 'string',
        label: 'Middle initial',
        extract: { sel: '#lblContactMiddleInit' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      lastName: {
        type: 'string',
        label: 'Last name',
        extract: { sel: '#lblContactLastName' },
        extractByPage: {
          account: { fn: 'firstAccountContactField', args: ['lastName'] },
        },
        transform: 'trim',
        validate: { required: true },
      },
      jobTitle: {
        type: 'string',
        label: 'Job title',
        extract: { sel: '#lblContactJobTitle' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      companyName: {
        type: 'string',
        label: 'Company name',
        extract: { sel: '#lblContactCompanyName' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      email: {
        type: 'string',
        label: 'Email',
        extract: { sel: '#lblContactEmail' },
        extractByPage: {
          account: { fn: 'firstAccountContactField', args: ['email'] },
        },
        transform: 'trim',
        validate: {
          required: true,
          pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: 'looks malformed',
        },
      },
      phone: {
        type: 'string',
        label: 'Phone number',
        /* The cell wraps the visible number in an <a> with a
           javascript: callback. Extract the cell's text and trim
           — strips the surrounding whitespace + handles the
           empty-anchor case. */
        extract: { sel: '#lblContactPhoneNumber', attr: 'innerText' },
        extractByPage: {
          account: { fn: 'firstAccountContactField', args: ['phone'] },
        },
        transform: 'trim',
      },
      phoneE164: {
        type: 'string',
        label: 'Phone (E.164)',
        extract: { sel: '#lblContactPhoneNumber', attr: 'innerText' },
        extractByPage: {
          account: { fn: 'firstAccountContactField', args: ['phone'] },
        },
        transform: 'normalizePhone',
      },
      zipCode: {
        type: 'string',
        label: 'ZIP code',
        extract: { sel: '#lblContactZipCode' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      state: {
        type: 'string',
        label: 'State',
        extract: { sel: '#lblContactMainState' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      country: {
        type: 'string',
        label: 'Country',
        extract: { sel: '#lblContactUserCountry' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      linkedInUrl: {
        type: 'string',
        label: 'LinkedIn URL',
        /* The cell wraps a possibly-empty anchor; the href IS the
           URL (the user pastes it into a custom data field).
           innerText might be empty, but the href is the data. */
        extract: { sel: '#lblContactCustomDataLinkedInURL a', attr: 'href' },
        extractByPage: { account: { const: null } },
      },
      context: {
        type: 'string',
        label: 'Context notes',
        extract: { sel: '#lblContactCustomDataContext' },
        extractByPage: { account: { const: null } },
        transform: 'trim',
      },
      archived: {
        type: 'bool',
        label: 'Archived',
        extract: { sel: '#chkContactArchived', attr: 'checked' },
        extractByPage: { account: { const: null } },
      },
      autoResponderClearDate: {
        type: 'date',
        label: 'Auto-responder clear date',
        /* "Not Set" → parseDate returns null. Other values come in
           as MM/DD/YYYY which parseDate handles. */
        extract: { sel: '#lblContactCustomDataAutoResponderClearDate' },
        extractByPage: { account: { const: null } },
      },
      sourceCampaign: {
        type: 'string',
        label: 'Source / partner campaign',
        extract: { sel: '#Td7' },
        /* Account page has its own #PartnerCampaignID select — same
           semantic, different DOM node. Surface the selected option
           label so templates see "Friend / Referral" not "1779". */
        extractByPage: {
          account: { sel: '#PartnerCampaignID', attr: 'selectedText' },
        },
        transform: 'trim',
      },
    },
  },

  /* ── Parent account info (same form on both pages) ────────── */
  account: {
    type: 'object',
    label: 'Account',
    fields: {
      name: {
        type: 'string',
        label: 'Account name',
        /* The visible form field uses the form input value; the
           read-only display version is identical content but in a
           different node. Prefer the input.value (it's editable
           so always live). */
        extract: { sel: '#Name', attr: 'value' },
        transform: 'trim',
        validate: { required: true },
      },
      webAddress: {
        type: 'string',
        label: 'Web address',
        extract: { sel: '#AccountWebAddress', attr: 'value' },
        transform: 'trim',
      },
      mainAddress: {
        type: 'string',
        label: 'Main address',
        extract: { sel: '#MainAddress', attr: 'value' },
        transform: 'trim',
      },
      city: {
        type: 'string',
        label: 'City',
        extract: { sel: '#MainCity', attr: 'value' },
        transform: 'trim',
      },
      postal: {
        type: 'string',
        label: 'Postal code',
        extract: { sel: '#MainPostal', attr: 'value' },
        transform: 'trim',
      },
      state: {
        type: 'string',
        label: 'State',
        extract: { sel: '#MainState', attr: 'value' },
        transform: 'trim',
      },
      country: {
        type: 'string',
        label: 'Country',
        extract: { sel: '#MainCountry', attr: 'selectedText' },
      },
      creditApproved: {
        type: 'date',
        label: 'Credit approved date',
        extract: { sel: '#ApprovedDate', attr: 'value' },
      },
      creditRequirements: {
        type: 'string',
        label: 'Credit requirements',
        extract: { sel: '#CreditRequirements', attr: 'value' },
        transform: 'trim',
      },
      territoryName: {
        type: 'string',
        label: 'Sales territory',
        extract: { sel: '#TerritoryID', attr: 'selectedText' },
      },
      createdBy: {
        type: 'string',
        label: 'Created by',
        extract: { sel: '#CreatedByAsName', attr: 'value' },
        transform: 'trim',
      },
      createdDate: {
        type: 'date',
        label: 'Created on',
        extract: { sel: '#CreatedDate', attr: 'value' },
      },
      contextNotes: {
        type: 'string',
        label: 'Account context',
        extract: { sel: '#AccountContext', attr: 'value' },
        transform: 'trim',
      },
      /* ── Account-only form fields (null on contact page) ── */
      modifiedDate: {
        type: 'date',
        label: 'Last modified',
        extract: { sel: '#ModifiedDate', attr: 'value' },
      },
      taxExempt: {
        type: 'string',
        label: 'Tax exempt status',
        extract: { sel: '#SalesTaxExempt1', attr: 'value' },
        transform: 'trim',
      },
      partnerCampaign: {
        type: 'string',
        label: 'Account partner campaign',
        extract: { sel: '#PartnerCampaignID', attr: 'selectedText' },
      },
      industry: {
        type: 'string',
        label: 'Industry',
        extract: { sel: '#Industry', attr: 'selectedText' },
      },
      linkedInUrl: {
        type: 'string',
        label: 'Account LinkedIn URL',
        extract: { sel: '#LinkedInURL', attr: 'value' },
        transform: 'trim',
      },
    },
  },

  /* ── Stat tiles (label/value rows under "Sales Stats" /
      "Mailer Stats" portlets). Contact page only — `findStat`
      returns null on the account page where these labels don't
      render, which the type coercion turns into the appropriate
      empty value per field type. ── */
  stats: {
    type: 'object',
    label: 'Stats',
    fields: {
      orderCount: {
        type: 'number',
        label: 'Order count',
        extract: { fn: 'findStat', args: ['Order Count'] },
      },
      totalRevenue: {
        type: 'currency',
        label: 'Total revenue (lifetime)',
        extract: { fn: 'findStat', args: ['Total Revenue'] },
      },
      lastOrderDate: {
        type: 'date',
        label: 'Last order date',
        extract: { fn: 'findStat', args: ['Last Order Date'] },
      },
      priorYearRevenue: {
        type: 'currency',
        label: 'Prior-year revenue',
        extract: { fn: 'findStat', args: ['Prior Year Revenue'] },
      },
      ytdRevenue: {
        type: 'currency',
        label: 'Year-to-date revenue',
        extract: { fn: 'findStat', args: ['Year-To-Date Revenue'] },
      },
      avgOrderSize: {
        type: 'currency',
        label: 'Average order size',
        extract: { fn: 'findStat', args: ['Avg Order Size'] },
      },
      mailerPoints: {
        type: 'number',
        label: 'Mailer points',
        extract: { fn: 'findStat', args: ['Mailer Points'] },
      },
      mailerRemoved: {
        type: 'number',
        label: 'Mailer removed flag',
        extract: { fn: 'findStat', args: ['Mailer Removed'] },
      },
      mailerRemoveDate: {
        type: 'date',
        label: 'Mailer removed date',
        extract: { fn: 'findStat', args: ['Mailer Remove Date'] },
      },
      mailerTouchDate: {
        type: 'date',
        label: 'Last mailer touch date',
        extract: { fn: 'findStat', args: ['Mailer Touch Date'] },
      },
      lastBounceCode: {
        type: 'string',
        label: 'Last bounce code',
        extract: { fn: 'findStat', args: ['Last Bounce Code'] },
      },
    },
  },

  /* ── Orders table (#DataTables_Table_0 — same id both pages) ─ */
  orders: {
    type: 'array',
    label: 'Recent orders',
    extract: { sel: '#DataTables_Table_0 tbody tr', max: 50 },
    itemFields: {
      number: {
        type: 'string',
        label: 'Order #',
        extract: { cell: 0, attr: 'innerText' },
        transform: 'trim',
      },
      url: {
        type: 'string',
        label: 'Order URL',
        /* href on the first cell's <a> — the link to the order
           detail page. Useful for code vars that want to link
           back into the CRM from a template. rowFn because the
           extractor reads from the current <tr>, not the doc. */
        extract: { rowFn: 'readHrefParam', args: [0, 'orderID'] },
      },
      summary: {
        type: 'string',
        label: 'Summary',
        extract: { cell: 1, attr: 'innerText' },
        transform: 'trim',
      },
      date: {
        type: 'date',
        label: 'Order date',
        extract: { cell: 2, attr: 'innerText' },
      },
      revenue: {
        type: 'currency',
        label: 'Revenue',
        extract: { cell: 3, attr: 'innerText' },
      },
      status: {
        type: 'string',
        label: 'Status',
        extract: { cell: 4, attr: 'innerText' },
        transform: 'trim',
      },
    },
  },

  /* ── Ordered items aggregate (#DataTables_Table_1) ─────────── */
  items: {
    type: 'array',
    label: 'Ordered items (aggregate)',
    extract: { sel: '#DataTables_Table_1 tbody tr', max: 100 },
    itemFields: {
      name: {
        type: 'string',
        label: 'Item name',
        extract: { cell: 0, attr: 'innerText' },
        transform: 'trim',
      },
      quantity: {
        type: 'number',
        label: 'Quantity',
        extract: { cell: 1, attr: 'innerText' },
      },
      revenue: {
        type: 'currency',
        label: 'Dollar amount',
        extract: { cell: 2, attr: 'innerText' },
      },
      orderCount: {
        type: 'number',
        label: 'Orders containing item',
        extract: { cell: 3, attr: 'innerText' },
      },
    },
  },

  /* ── Tasks: open + completed ──────────────────────────────────
      Contact page → unique table ids (#TableTasks / #TableCompletedTasks).
      Account page → BOTH portlets render `#TableTasks` (CRM bug,
      duplicate id). Per-page override switches to the helper that
      scopes by portlet caption text. */
  tasks: {
    type: 'object',
    label: 'Tasks',
    fields: {
      open: {
        type: 'array',
        label: 'Open tasks',
        extract: { keyedRows: { container: '#TableTasks', rowPrefix: 'taskrow_' }, max: 50 },
        extractByPage: {
          account: { fn: 'openTaskRows', max: 50 },
        },
        itemFields: {
          id: {
            type: 'string',
            label: 'Task ID',
            /* The row's primary key — extract.js exposes this via
               ctx.rowKey; we surface it as a field too. */
            extract: { rowKey: true },
          },
          subject: {
            type: 'string', label: 'Subject',
            extract: { keyedFn: 'keyedField', args: ['subject'] },
            transform: 'trim',
          },
          category: {
            type: 'string', label: 'Category',
            extract: { keyedFn: 'keyedField', args: ['category'] },
            transform: 'trim',
          },
          status: {
            type: 'string', label: 'Status',
            extract: { keyedFn: 'keyedField', args: ['status'] },
            transform: 'trim',
          },
          priority: {
            type: 'string', label: 'Priority',
            /* visibleText skips the hidden <div>3</div> sort-key
               sibling that lives next to the visible label. */
            extract: { keyedFn: 'keyedField', args: ['priority', 'visibleText'] },
            transform: 'trim',
          },
          liveDate: {
            type: 'date', label: 'Live date',
            extract: { keyedFn: 'keyedField', args: ['livedate'] },
          },
          dueDate: {
            type: 'date', label: 'Due date',
            extract: { keyedFn: 'keyedField', args: ['duedate'] },
          },
        },
      },
      done: {
        type: 'array',
        label: 'Completed tasks',
        extract: { keyedRows: { container: '#TableCompletedTasks', rowPrefix: 'taskrow_' }, max: 50 },
        extractByPage: {
          account: { fn: 'completedTaskRows', max: 50 },
        },
        itemFields: {
          id: {
            type: 'string', label: 'Task ID',
            extract: { rowKey: true },
          },
          subject: {
            type: 'string', label: 'Subject',
            extract: { keyedFn: 'keyedField', args: ['subject'] },
            transform: 'trim',
          },
          category: {
            type: 'string', label: 'Category',
            extract: { keyedFn: 'keyedField', args: ['category'] },
            transform: 'trim',
          },
          priority: {
            type: 'string', label: 'Priority',
            extract: { keyedFn: 'keyedField', args: ['priority', 'visibleText'] },
            transform: 'trim',
          },
          liveDate: {
            type: 'date', label: 'Live date',
            extract: { keyedFn: 'keyedField', args: ['livedate'] },
          },
          dueDate: {
            type: 'date', label: 'Due date',
            extract: { keyedFn: 'keyedField', args: ['duedate'] },
          },
        },
      },
    },
  },

  /* ── Opportunities table (same #TableOpportunities both pages) ─ */
  opportunities: {
    type: 'array',
    label: 'Opportunities',
    extract: { sel: '#TableOpportunities tbody tr', max: 50 },
    itemFields: {
      id: {
        type: 'string', label: 'Opportunity ID',
        extract: { cell: 0, attr: 'innerText' },
        transform: 'trim',
      },
      subject: {
        type: 'string', label: 'Subject',
        extract: { cell: 1, attr: 'innerText' },
        transform: 'trim',
      },
      estimatedValue: {
        type: 'currency', label: 'Estimated value',
        extract: { cell: 2, attr: 'innerText' },
      },
      estimatedCloseDate: {
        type: 'date', label: 'Estimated close date',
        extract: { cell: 3, attr: 'innerText' },
      },
      stage: {
        type: 'string', label: 'Stage',
        extract: { cell: 4, attr: 'innerText' },
        transform: 'trim',
      },
    },
  },

  /* ── Activities log (interactions: emails, calls, etc.) ───── */
  activities: {
    type: 'array',
    label: 'Activities',
    extract: { sel: '#ActivityTable tbody tr', max: 100 },
    itemFields: {
      employee: {
        type: 'string', label: 'Employee',
        extract: { cell: 1, attr: 'innerText' },
        transform: 'trim',
      },
      category: {
        type: 'string', label: 'Category',
        extract: { cell: 2, attr: 'innerText' },
        transform: 'trim',
      },
      direction: {
        type: 'string', label: 'Direction',
        extract: { cell: 3, attr: 'innerText' },
        transform: 'trim',
      },
      subject: {
        type: 'string', label: 'Subject',
        extract: { cell: 4, attr: 'innerText' },
        transform: 'trim',
      },
      date: {
        type: 'date', label: 'Date',
        extract: { cell: 5, attr: 'innerText' },
      },
    },
  },

  /* ── Email history (separate from activities; rows have the
      data-gbep="1" marker the mailer-platform stamps onto
      sent messages). ── */
  emails: {
    type: 'array',
    label: 'Email history',
    /* Row layout: [0:icon] [1:from] [2:to] [3:subject] [4:date]
       [5:size] [6:download-link]. The first cell is just an icon
       slot the marketing platform stamps onto its own rows
       (data-gbep="1"). */
    extract: { sel: 'tr[data-gbep="1"]', max: 100 },
    itemFields: {
      from: {
        type: 'string', label: 'From',
        extract: { cell: 1, attr: 'innerText' },
        transform: 'trim',
      },
      to: {
        type: 'string', label: 'To',
        extract: { cell: 2, attr: 'innerText' },
        transform: 'trim',
      },
      subject: {
        type: 'string', label: 'Subject',
        extract: { cell: 3, attr: 'innerText' },
        transform: 'trim',
      },
      date: {
        type: 'date', label: 'Sent date',
        extract: { cell: 4, attr: 'innerText' },
      },
      sizeBytes: {
        type: 'number', label: 'Size (bytes)',
        extract: { cell: 5, attr: 'innerText' },
      },
    },
  },

  /* ── Account Contacts table (account-only canonically; resolves
      to [] on the contact page where no such portlet renders).
      Lets templates that want to iterate every related contact do
      that explicitly while `contact.*` continues to surface the
      first one for single-contact templates. ── */
  contacts: {
    type: 'array',
    label: 'Account contacts',
    extract: { fn: 'accountContactRows' },
    itemFields: {
      fullName: {
        type: 'string', label: 'Full name',
        extract: { cell: 0, attr: 'innerText' },
        transform: 'trim',
      },
      firstName: {
        type: 'string', label: 'First name',
        extract: { rowFn: 'splitNameCell', args: [0, 'first'] },
      },
      lastName: {
        type: 'string', label: 'Last name',
        extract: { rowFn: 'splitNameCell', args: [0, 'last'] },
      },
      email: {
        type: 'string', label: 'Email',
        extract: { cell: 1, attr: 'innerText' },
        transform: 'trim',
      },
      phone: {
        type: 'string', label: 'Phone',
        extract: { cell: 2, attr: 'innerText' },
        transform: 'trim',
      },
      contactType: {
        type: 'string', label: 'Contact type',
        extract: { cell: 3, attr: 'innerText' },
        transform: 'trim',
      },
      partnerCampaign: {
        type: 'string', label: 'Partner campaign',
        extract: { cell: 4, attr: 'innerText' },
        transform: 'trim',
      },
      detailUrl: {
        type: 'string', label: 'Contact detail URL',
        extract: { rowFn: 'firstCellHref', args: [0] },
      },
    },
  },
};

export const contactSchema = {
  id: 'contact',
  label: 'Contact Details Page',
  detect: {
    /* `Page=240` is the canonical contact-detail URL. The DOM
       fallback uses #lblContactFirstName — a contact-only label
       that's absent on the account page. We previously checked
       #tbContactId, but the account page renders that same hidden
       input (it backs the Tasks modal) so the contact schema would
       greedy-match account pages and the per-page overrides never
       kicked in. */
    url: /[?&]Page=240\b/i,
    dom: '#lblContactFirstName',
    mode: 'any', // env-dependent URL; DOM marker covers the gap
  },
  fields: FIELDS,
};

export const accountSchema = {
  id: 'account',
  label: 'Account Details Page',
  detect: {
    /* Page=271 is the canonical account detail URL. The DOM
       fallback uses #PartnerCampaignID — an account-only form
       select that's absent on the contact page. Reaches this
       branch only after contactSchema's URL/DOM check has already
       failed (registry order is contact → account). */
    url: /[?&]Page=271\b/i,
    dom: '#PartnerCampaignID',
    mode: 'any',
  },
  fields: FIELDS,
};
