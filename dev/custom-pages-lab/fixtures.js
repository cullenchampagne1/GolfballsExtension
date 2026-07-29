/**
 * Rich, deterministic fixtures for the standalone Custom Pages Lab.
 *
 * Keep this data in the shape emitted by src/vanilla/custom-pages.js. The lab
 * renders production page components, so fixture drift remains visible.
 */

export const LAB_PAGES = Object.freeze([
  { id: 'contact', label: 'Contact details' },
  { id: 'account', label: 'Account details' },
  { id: 'opportunity', label: 'Opportunity details' },
  { id: 'search', label: 'CRM search' },
  { id: 'action-review', label: 'Action Review' },
]);

export const LAB_MODES = Object.freeze([
  { id: 'populated', label: 'Populated' },
  { id: 'stress', label: 'Stress data' },
  { id: 'empty', label: 'Empty states' },
]);

const DAY = 86_400_000;
const isoDaysAgo = (days, hour = 15) => new Date(Date.now() - (days * DAY) + (hour * 3_600_000)).toISOString();

function proofImage(label, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="380" viewBox="0 0 720 380">
    <rect width="720" height="380" fill="#f5f6f7"/>
    <circle cx="180" cy="190" r="116" fill="#fff" stroke="#d8dce0" stroke-width="8"/>
    <path d="M114 204c34-70 102-86 156-30" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
    <text x="350" y="174" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#222">${label}</text>
    <text x="350" y="214" font-family="Arial,sans-serif" font-size="20" fill="#687078">CUSTOM ART PROOF</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const orderNames = [
  'Titleist Pro V1 Custom Logo Golf Balls — double dozen event pack',
  'TaylorMade TP5 Personalized Golf Balls with custom tournament mark',
  'Venture Golf Towel with embroidered two-color crest',
  'Callaway Chrome Tour Custom Logo Golf Balls',
  'Nike Dri-FIT Victory Polo — left sleeve embroidery',
  'YETI Rambler 20 oz Tumbler — laser engraved',
  'Bridgestone Tour B RX Personalized Golf Balls',
  'Adidas Performance Cap — centered embroidery',
];

function orders(count) {
  return Array.from({ length: count }, (_, index) => ({
    number: String(5063056 - index * 137),
    summary: orderNames[index % orderNames.length],
    date: isoDaysAgo(18 + index * 31),
    revenue: Number((72.45 + (index % 7) * 183.27).toFixed(2)),
    status: index % 6 === 5 ? 'Processing' : 'Complete',
    href: `https://www.golfballs.com/order/${5063056 - index * 137}`,
  }));
}

function items(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: orderNames[index % orderNames.length],
    quantity: 12 + (index * 24),
    revenue: Number((108.5 + index * 427.34).toFixed(2)),
    orderCount: 1 + (index % 6),
  }));
}

const activitySeed = [
  { category: 'Call', subject: 'Discussed fall tournament order, quantities, and the customer’s preferred delivery window.', direction: 'Outbound', employee: 'Cullen Champagne' },
  { category: 'Email', subject: 'Sent revised proposal and confirmed imprint colors.', direction: 'Outbound', employee: 'Cullen Champagne' },
  { category: 'Live Chat', subject: 'Customer: Can the logo be stitched on the left sleeve?\nAgent: Yes — I will add that placement to the proof.', direction: 'Inbound', employee: 'Support' },
  { category: 'Artwork', subject: 'New vector logo uploaded for production review.', direction: 'System', employee: 'Artwork Queue' },
  { category: 'Note', subject: 'Purchasing committee meets Friday. Follow up after 2 PM.', direction: 'Internal', employee: 'Cullen Champagne' },
  { category: 'Workflow', subject: 'Proposal moved from Qualified to Proposed.', direction: 'System', employee: 'CRM Automation' },
];

function activities(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `ACT-${9000 + index}`,
    ...activitySeed[index % activitySeed.length],
    date: isoDaysAgo(index * 2, 9 + (index % 8)),
  }));
}

function emails(count) {
  const subjects = [
    'Re: Fall scramble pricing and delivery timing',
    'Your revised custom-logo proof is ready',
    'TaylorMade restock options for the team store',
    'Re: Embroidery placement on performance polos',
    'Order confirmation and production schedule',
  ];
  return Array.from({ length: count }, (_, index) => ({
    from: index % 3 === 0 ? 'alex.morgan@northstarathletics.com' : 'cullen@golfballs.com',
    to: index % 3 === 0 ? 'cullen@golfballs.com' : 'alex.morgan@northstarathletics.com',
    subject: subjects[index % subjects.length],
    date: isoDaysAgo(index * 3, 8 + (index % 9)),
    sizeBytes: 7_800 + index * 2_413,
  }));
}

function openTasks(count) {
  const subjects = [
    'Order Anniversary Follow Up #1 [2025]',
    'Confirm logo thread colors before proof approval',
    'Prior Year Call — November',
    'Send tournament bundle recommendations',
    'Review tax-exempt certificate renewal',
    'Follow up on proposal expiration',
  ];
  const owners = ['Cullen Champagne', 'Taylor Reed', 'Jordan Park'];
  return Array.from({ length: count }, (_, index) => ({
    id: `TASK-${7000 + index}`,
    subject: subjects[index % subjects.length],
    owner: owners[index % owners.length],
    category: ['Follow Up', 'Artwork', 'Call', 'Sales'][index % 4],
    priority: ['High', 'Med', 'Low'][index % 3],
    dueDate: isoDaysAgo(-3 - index * 2),
    liveDate: isoDaysAgo(4 - index),
    status: 'Open',
  }));
}

function doneTasks(count) {
  const owners = ['Cullen Champagne', 'Taylor Reed', 'Jordan Park'];
  return Array.from({ length: count }, (_, index) => ({
    id: `DONE-${6100 + index}`,
    subject: ['Completed proof review', 'Confirmed shipping address', 'Logged quarterly reach out', 'Closed prior-year follow-up'][index % 4],
    owner: owners[index % owners.length],
    category: ['Artwork', 'Order', 'Call', 'Follow Up'][index % 4],
    priority: 'Med',
    liveDate: isoDaysAgo(7 + index * 3),
    dueDate: isoDaysAgo(4 + index * 3),
    status: 'Complete',
  }));
}

function opportunities(count) {
  const subjects = ['2026 Employee Appreciation Gifts', 'Fall Charity Scramble', 'Executive Welcome Kits', 'Regional Tournament Restock'];
  const stages = ['Open', 'Qualified', 'Proposed', 'Won'];
  const owners = ['Cullen Champagne', 'Taylor Reed', 'Jordan Park', 'Account Owner'];
  return Array.from({ length: count }, (_, index) => ({
    id: String(38012 + index),
    subject: subjects[index % subjects.length],
    owner: owners[index % owners.length],
    estimatedValue: 2_500 + index * 1_375,
    estimatedCloseDate: isoDaysAgo(-20 - index * 13),
    stage: stages[index % stages.length],
  }));
}

function contacts(count) {
  const people = [
    ['Alex', 'Morgan', 'alex.morgan@northstarathletics.com', 'Director of Partnerships'],
    ['David', 'Kim', 'david.kim@northstarathletics.com', 'Tournament Operations'],
    ['Priya', 'Shah', 'priya.shah@northstarathletics.com', 'Accounts Payable'],
    ['Marcus', 'Chen', 'marcus.chen@northstarathletics.com', 'Marketing'],
  ];
  return Array.from({ length: count }, (_, index) => {
    const person = people[index % people.length];
    return {
      id: String(44210 + index),
      firstName: person[0],
      lastName: person[1],
      fullName: `${person[0]} ${person[1]}`,
      email: person[2],
      phone: `(312) 555-${String(2100 + index).padStart(4, '0')}`,
      contactType: index === 0 ? 'Primary' : person[3],
      partnerCampaign: ['Direct', 'Referral · Midwest Golf Expo', 'Existing Customer'][index % 3],
      detailUrl: `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${44210 + index}`,
    };
  });
}

function proofs() {
  return [
    { name: 'Northstar shield — ball imprint', kind: 'Golf Ball', status: 'Approved', date: isoDaysAgo(2), logo: proofImage('NORTHSTAR', '#4568dc'), pdf: '#proof-pdf', history: '#proof-history' },
    { name: 'Tournament crest — towel embroidery', kind: 'Embroidery', status: 'Pending review', date: isoDaysAgo(1), logo: proofImage('TOURNAMENT', '#e07a2d'), pdf: '#proof-pdf', instant_mockup: '#mockup' },
    { name: 'Employee event mark — tumbler engraving', kind: 'Laser Engraving', status: 'Revision requested', date: isoDaysAgo(0), logo: proofImage('EVENT 2026', '#3b9b78'), apparel_mockup: '#mockup' },
  ];
}

function baseFixture(mode) {
  const stress = mode === 'stress';
  const empty = mode === 'empty';
  const counts = stress
    ? { orders: 72, items: 30, activities: 80, emails: 65, tasks: 42, done: 38, opportunities: 18, contacts: 24 }
    : { orders: 14, items: 8, activities: 16, emails: 12, tasks: 10, done: 8, opportunities: 5, contacts: 6 };

  return {
    ids: { contact: '44210', account: '2188', opportunity: '38012' },
    contact: {
      firstName: 'Alex',
      lastName: 'Morgan',
      middleInit: 'J',
      jobTitle: 'Director of Strategic Partnerships',
      email: 'alex.morgan@northstarathletics.com',
      phone: '(312) 555-0147 ext. 204',
      zipCode: '60606',
      state: 'IL',
      country: 'United States',
      linkedInUrl: 'https://www.linkedin.com/in/alex-morgan',
      userType: 'Customer',
      archived: false,
      context: 'Prefers concise email follow-ups. Buying committee meets on Friday afternoons.',
    },
    account: {
      name: 'Northstar Athletics & Community Foundation',
      industry: 'Sports & Recreation',
      webAddress: 'https://northstarathletics.example',
      mainAddress: '225 W Wacker Drive, Suite 1800',
      city: 'Chicago',
      state: 'IL',
      postal: '60606',
      territoryName: 'Midwest Enterprise',
      salesRep: 'Cullen Champagne',
      taxExempt: true,
      userType: 'Corporate',
      creditApproved: '2025-08-14',
      linkedInUrl: 'https://www.linkedin.com/company/northstar-athletics',
      contextNotes: 'Multi-location buyer with annual tournaments, employee gifting, and a recurring Q4 restock.',
      createdBy: 'Web Import',
      createdDate: '2018-04-11',
      modifiedDate: isoDaysAgo(1),
    },
    stats: {
      totalRevenue: 184_742.86,
      orderCount: empty ? 0 : counts.orders,
      avgOrderSize: 1_319.59,
      ytdRevenue: 28_906.42,
      priorYearRevenue: 41_772.18,
      lastOrderDate: isoDaysAgo(18),
      mailerRemoved: false,
      mailerPoints: 92,
      mailerTouchDate: isoDaysAgo(13),
      lastBounceCode: '',
    },
    orders: empty ? [] : orders(counts.orders),
    items: empty ? [] : items(counts.items),
    tasks: {
      open: empty ? [] : openTasks(counts.tasks),
      done: empty ? [] : doneTasks(counts.done),
    },
    opportunities: empty ? [] : opportunities(counts.opportunities),
    activities: empty ? [] : activities(counts.activities),
    emails: empty ? [] : emails(counts.emails),
    proofs: empty ? [] : proofs(),
    contacts: empty ? [] : contacts(counts.contacts),
    lookups: empty ? [] : [
      { type: 'Customer Number', value: 'NSAF-1002188' },
      { type: 'ERP Account', value: 'GB-CHI-44210' },
      { type: 'Legacy Email', value: 'purchasing@northstarathletics.com' },
      { type: 'Long reference value', value: 'MIDWEST-CORPORATE-PARTNERSHIP-ANNUAL-TOURNAMENT-2026' },
    ],
  };
}

export function resolveLabPage(value) {
  return LAB_PAGES.some((page) => page.id === value) ? value : 'contact';
}

export function resolveLabMode(value) {
  return LAB_MODES.some((mode) => mode.id === value) ? value : 'populated';
}

export function buildPageFixture(page = 'contact', mode = 'populated') {
  const resolvedPage = resolveLabPage(page);
  const resolvedMode = resolveLabMode(mode);
  const fixture = baseFixture(resolvedMode);
  if (resolvedPage === 'account') fixture.ids.contact = fixture.contacts[0]?.id || fixture.ids.contact;
  return fixture;
}

export function buildOpportunityFixture(mode = 'populated') {
  const empty = resolveLabMode(mode) === 'empty';
  return {
    id: '38012',
    subject: empty ? 'Untitled opportunity' : '2026 Employee Appreciation & Tournament Program',
    stage: empty ? 'Open' : 'Proposed',
    stageId: empty ? 1 : 4,
    source: 'Green Grass',
    sourceId: 4,
    estimatedValue: empty ? 0 : 18_750,
    estimatedClosedDate: '2026-09-18',
    closedProbability: empty ? 0 : 72,
    description: empty ? '' : 'Annual multi-product program spanning golf balls, embroidered apparel, event towels, and executive gifts. This deliberately long description tests wrapping without inflating the card.',
    createdById: '104',
    assignedById: '104',
    createdBy: 'Cullen Champagne',
    assignedTo: 'Cullen Champagne',
    actualValue: 0,
    actualClosedDate: '',
    lastModified: isoDaysAgo(1),
    proposalCount: empty ? 0 : 4,
  };
}

export function buildProposalFixtures(mode = 'populated') {
  if (resolveLabMode(mode) === 'empty') return [];
  return [
    { cartId: 'CART-92841', name: 'Tournament essentials · good / better / best', expiration: '09/18/2026', newSite: true },
    { cartId: 'CART-92867', name: 'Executive gifting package with a deliberately long proposal name', expiration: '09/25/2026', newSite: true },
    { cartId: 'CART-91704', name: 'Prior-year restock comparison', expiration: '08/30/2026', newSite: false },
    { cartId: 'CART-93002', name: 'Apparel and embroidered accessories', expiration: '10/02/2026', newSite: true },
  ];
}

function searchDocs(count) {
  const names = ['Alex Morgan', 'David Kim', 'Priya Shah', 'Marcus Chen', 'Jordan Williams', 'Sam Rivera'];
  const accounts = ['Northstar Athletics & Community Foundation', 'Lakeside Country Club', 'Riverbend Events', 'Metro Youth Golf'];
  return Array.from({ length: count }, (_, index) => {
    const account = index % 4 === 1;
    return {
      id: `${account ? 'account' : 'contact'}_${44210 + index}`,
      recordType_s: account ? 'Account' : (index % 7 === 0 ? 'Lead' : 'Contact'),
      contactName_t: account ? '' : names[index % names.length],
      accountName_t: accounts[index % accounts.length],
      accountID_s: String(2188 + (index % accounts.length)),
      salesRep_s: ['Cullen Champagne', 'Taylor Reed', 'Jordan Park', 'None'][index % 4],
      emails_tps: account ? [] : [`${names[index % names.length].toLowerCase().replace(' ', '.')}@example.com`],
      lastOrderDate_dt: index % 9 === 8 ? '' : isoDaysAgo(12 + index * 8),
      orderCount_i: index % 9,
      nextTaskDate_dt: index % 5 === 4 ? '' : isoDaysAgo(-2 - index),
    };
  });
}

export function buildSearchFixture(mode = 'populated') {
  const resolved = resolveLabMode(mode);
  const count = resolved === 'empty' ? 0 : resolved === 'stress' ? 140 : 28;
  const docs = searchDocs(count);
  return {
    query: resolved === 'empty' ? 'no matching customer' : 'northstar',
    type: 'all',
    docs,
    numFound: resolved === 'stress' ? 1_284 : docs.length,
    facets: {
      fields: {
        recordType_s: [{ value: 'Contact', count: 844 }, { value: 'Account', count: 312 }, { value: 'Lead', count: 128 }],
        salesRep_s: ['Cullen Champagne', 'Taylor Reed', 'Jordan Park', 'Avery Brooks', 'Morgan Bell', 'Casey Lane', 'Riley Stone', 'Jamie Fox', 'Drew Hall', 'None'].map((value, index) => ({ value, count: 210 - index * 17 })),
        role_s: [{ value: 'Decision Maker', count: 306 }, { value: 'Purchasing', count: 248 }, { value: 'Billing', count: 119 }, { value: 'Influencer', count: 88 }],
        podID_i: [{ value: '1', count: 378 }, { value: '2', count: 324 }, { value: '3', count: 281 }, { value: '4', count: 190 }],
      },
      queries: {
        'lastOrderDate_dt:[NOW-30DAYS TO *]': 194,
        'lastOrderDate_dt:[NOW-90DAYS TO NOW-30DAYS]': 286,
        'lastOrderDate_dt:[NOW-1YEAR TO NOW-90DAYS]': 411,
        'lastOrderDate_dt:[* TO NOW-1YEAR]': 238,
        '-lastOrderDate_dt:[* TO *]': 155,
        'nextTaskDate_dt:[* TO NOW]': 87,
        'nextTaskDate_dt:[NOW TO NOW+7DAYS]': 143,
        'nextTaskDate_dt:[NOW TO NOW+30DAYS]': 302,
        '-nextTaskDate_dt:[* TO *]': 752,
      },
    },
  };
}

export function createSearchFixtureClient(fixture) {
  return async ({ query = '', type = 'all', start = 0 } = {}) => {
    const term = query.trim().toLowerCase();
    let docs = fixture.docs.filter((row) => {
      const typeMatch = type === 'all' || String(row.recordType_s || '').toLowerCase() === type;
      const haystack = `${row.contactName_t || ''} ${row.accountName_t || ''} ${(row.emails_tps || []).join(' ')}`.toLowerCase();
      return typeMatch && (!term || haystack.includes(term));
    });
    const numFound = docs.length;
    docs = docs.slice(start, start + 100);
    return { docs, numFound, facets: start === 0 ? fixture.facets : null };
  };
}

function actionReviewDate(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * DAY);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function actionReviewTasks(count) {
  const subjects = [
    'Order Anniversary Follow Up Call',
    'Proposal follow up via phone',
    'Confirm artwork approval before production',
    'Send revised tournament pricing',
    'Prior Year Call — quarterly account review',
    'Check delivery status and tracking',
  ];
  const categories = ['Order History Special', 'Proposal Follow-up', 'Artwork', 'Sales Follow-up', 'Prior Year Call', 'Order'];
  return Array.from({ length: count }, (_, index) => ({
    id: String(755_000 + index),
    subject: subjects[index % subjects.length],
    category: categories[index % categories.length],
    status: index % 5 === 0 ? 'Complete' : index % 7 === 0 ? 'Waiting' : 'New',
    live: actionReviewDate(22 - (index % 22)),
    due: actionReviewDate(8 - (index % 15)),
  }));
}

export function buildActionReviewFixture(mode = 'populated') {
  const resolved = resolveLabMode(mode);
  const empty = resolved === 'empty';
  const stress = resolved === 'stress';
  const activityRows = empty ? [] : activities(stress ? 180 : 80);
  const emailRows = empty ? [] : emails(stress ? 120 : 40).map((email, index) => ({
    ...email,
    size: email.sizeBytes,
    href: `Default.aspx?Page=268&MessageID=${40_690_000 + index}`,
  }));
  const taskRows = empty ? [] : actionReviewTasks(stress ? 2_400 : 225);
  const selectedDate = toLabIsoDate(new Date());
  return {
    activities: activityRows,
    emails: emailRows,
    tasks: taskRows,
    reps: [
      { id: '2370', label: 'Cullen Champagne' },
      { id: '1114', label: 'Alex Sylvester' },
      { id: '2377', label: 'Aaron Hunter' },
      { id: '47', label: 'Andy Melancon' },
      { id: '104', label: 'Taylor Reed' },
    ],
    selected: {
      rep: '2370',
      dateOption: 'ON',
      date1: selectedDate,
      date2: selectedDate,
    },
    formState: {
      __VIEWSTATE: 'lab-view-state',
      __EVENTVALIDATION: 'lab-event-validation',
    },
    formAction: 'Default.aspx?Page=286',
  };
}

function toLabIsoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function createActionReviewFixtureClient(fixture) {
  return async ({ type, filters } = {}) => {
    if (type !== 'filter') return fixture;
    return {
      ...fixture,
      selected: {
        rep: filters?.rep || fixture.selected.rep,
        dateOption: filters?.dateOption || fixture.selected.dateOption,
        date1: filters?.date1 || fixture.selected.date1,
        date2: filters?.date2 || fixture.selected.date2,
      },
    };
  };
}

export function createFixtureStore(initialValue) {
  let current = initialValue;
  const listeners = new Set();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(nextValue) {
      current = nextValue;
      listeners.forEach((listener) => listener());
    },
  };
}
