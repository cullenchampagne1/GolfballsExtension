/* ───────────────────────────────────────────────────────────────
   page-schemas/contact.js — schema for the CRM Contact Details
   page (URL pattern `Page=240` or `customerID=…`).

   Authored from the sample HTML at
     Golfballs Administration _ .._Modules_CRM_Admin -
     ContactDetails.html

   Structure mirrors the page's visual hierarchy:
     contact     — current contact's personal + contact info
     account     — the parent account record (name, address, rep)
     stats       — sales + mailer aggregate stats (label/value tiles)
     orders      — Orders table (most recent first)
     items       — Ordered Items table (aggregated)
     tasks.open  — open tasks (TableTasks)
     tasks.done  — completed tasks (TableCompletedTasks)
     opportunities — Opportunities table
     activities  — Activities table (interactions log)
     emails      — Email History rows
     ids         — stable internal IDs (contact, account)

   Field-level extractors prefer stable element IDs when present.
   For stat tiles the schema uses the `findStat` helper which
   walks `<th>label</th><td>value</td>` pairs by visible label
   text — those rows have no IDs in the source HTML.

   Validation: `required: true` is set only on fields that the
   downstream templates rely on (firstName, email, account name).
   Soft warnings only — the engine doesn't refuse to extract.
─────────────────────────────────────────────────────────────── */

export const contactSchema = {
  id: 'contact',
  label: 'Contact Details Page',
  detect: {
    url: /[?&](?:Page=240\b|customerID=\d+)/i,
    dom: '#tbContactId',
    mode: 'any', // some envs hide the URL; fall back to DOM marker
  },

  fields: {
    /* ── Stable internal identifiers ───────────────────────────── */
    ids: {
      type: 'object',
      label: 'IDs',
      fields: {
        contact: {
          type: 'string',
          label: 'Contact ID',
          extract: { sel: '#tbContactId', attr: 'value' },
          validate: { required: true, pattern: /^\d+$/, message: 'expected numeric contact ID' },
        },
        account: {
          type: 'string',
          label: 'Account ID',
          extract: { sel: '#AccountID', attr: 'value' },
        },
        /* The Tasks modal carries a hidden #tbContactID (capital D)
           — different node from #tbContactId. Both should agree;
           we expose the second one too for debugging when they
           drift (it's happened in older CRM builds). */
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
          transform: 'trim',
          validate: { required: true },
        },
        middleInitial: {
          type: 'string',
          label: 'Middle initial',
          extract: { sel: '#lblContactMiddleInit' },
          transform: 'trim',
        },
        lastName: {
          type: 'string',
          label: 'Last name',
          extract: { sel: '#lblContactLastName' },
          transform: 'trim',
          validate: { required: true },
        },
        jobTitle: {
          type: 'string',
          label: 'Job title',
          extract: { sel: '#lblContactJobTitle' },
          transform: 'trim',
        },
        companyName: {
          type: 'string',
          label: 'Company name',
          extract: { sel: '#lblContactCompanyName' },
          transform: 'trim',
        },
        email: {
          type: 'string',
          label: 'Email',
          extract: { sel: '#lblContactEmail' },
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
          transform: 'trim',
        },
        phoneE164: {
          type: 'string',
          label: 'Phone (E.164)',
          extract: { sel: '#lblContactPhoneNumber', attr: 'innerText' },
          transform: 'normalizePhone',
        },
        zipCode: {
          type: 'string',
          label: 'ZIP code',
          extract: { sel: '#lblContactZipCode' },
          transform: 'trim',
        },
        state: {
          type: 'string',
          label: 'State',
          extract: { sel: '#lblContactMainState' },
          transform: 'trim',
        },
        country: {
          type: 'string',
          label: 'Country',
          extract: { sel: '#lblContactUserCountry' },
          transform: 'trim',
        },
        linkedInUrl: {
          type: 'string',
          label: 'LinkedIn URL',
          /* The cell wraps a possibly-empty anchor; the href IS the
             URL (the user pastes it into a custom data field).
             innerText might be empty, but the href is the data. */
          extract: { sel: '#lblContactCustomDataLinkedInURL a', attr: 'href' },
        },
        context: {
          type: 'string',
          label: 'Context notes',
          extract: { sel: '#lblContactCustomDataContext' },
          transform: 'trim',
        },
        archived: {
          type: 'bool',
          label: 'Archived',
          extract: { sel: '#chkContactArchived', attr: 'checked' },
        },
        autoResponderClearDate: {
          type: 'date',
          label: 'Auto-responder clear date',
          /* "Not Set" → parseDate returns null. Other values come in
             as MM/DD/YYYY which parseDate handles. */
          extract: { sel: '#lblContactCustomDataAutoResponderClearDate' },
        },
        sourceCampaign: {
          type: 'string',
          label: 'Source / partner campaign',
          extract: { sel: '#Td7' },
          transform: 'trim',
        },
      },
    },

    /* ── Parent account info ──────────────────────────────────── */
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
      },
    },

    /* ── Stat tiles (label/value rows under "Sales Stats" /
        "Mailer Stats" portlets). No element IDs on the value
        cells — findStat walks `<th>label</th><td>value</td>`. ── */
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

    /* ── Orders table (#DataTables_Table_0) ────────────────────── */
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

    /* ── Tasks: open + completed ──────────────────────────────── */
    tasks: {
      type: 'object',
      label: 'Tasks',
      fields: {
        open: {
          type: 'array',
          label: 'Open tasks',
          extract: { keyedRows: { container: '#TableTasks', rowPrefix: 'taskrow_' }, max: 50 },
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

    /* ── Opportunities table ──────────────────────────────────── */
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
  },
};
