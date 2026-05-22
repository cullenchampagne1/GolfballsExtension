if (window.__gbLoaded_smartDetection) {} else { window.__gbLoaded_smartDetection = true;
// smart-detection.js — page scraping, smart variable detection,
//   OOS item lookup, brand/replacement engine, sales rep tracking

// ═══════════════════════════════════════════════════════
  // SMART DETECTION (built-in variables)
  // ═══════════════════════════════════════════════════════

  function isInternalEmail(addr) {
    return /golfballs\.com$/i.test(addr) || /noreply|no-reply|donotreply/i.test(addr);
  }

  function smartEmail(doc = document) {
    const bodyText = doc.body.innerText || doc.body.textContent || '';
    for (const p of [
      /(?:email|e-mail|customer\s*email)[:\s]+([^\s<>\n,;]+@[^\s<>\n,;]+\.[a-z]{2,})/i,
      /(?:billing|contact)\s*email[:\s]+([^\s<>\n,;]+@[^\s<>\n,;]+\.[a-z]{2,})/i
    ]) {
      const m = bodyText.match(p);
      if (m && !isInternalEmail(m[1])) return m[1].trim();
    }
    for (const a of doc.querySelectorAll('a[href^="mailto:"]')) {
      const addr = a.href.replace('mailto:', '').split('?')[0].trim();
      if (addr.includes('@') && !isInternalEmail(addr)) return addr;
    }
    const all = (bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
    return all.find(e => !isInternalEmail(e)) || '';
  }

  function smartCustomerId(doc = document) {
    const contactLink = doc.querySelector('a[href*="customerID="]');
    if (contactLink) {
      const m = (contactLink.getAttribute('href') || '').match(/customerID=(\d+)/i);
      if (m) return m[1];
    }
    const bodyText = doc.body.innerText || doc.body.textContent || '';
    const m = bodyText.match(/Customer\s*#\s*(\d+)/i);
    if (m) return m[1];
    return '';
  }

  let __gbBroadcastedSalesRep = '';
  window.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'GB_SALES_REP_FOUND') {
          __gbBroadcastedSalesRep = event.data.salesRep;
      }
  });

  function __gbFindItemLinkForImage(img) {
    let row = img.closest('tr');
    for (let i = 0; i < 3; i++) {
      if (!row) break;
      const anchor = row.querySelector('a.nodes') || row.querySelector('a[href*=".htm"]');
      if (anchor && anchor.href) return anchor.href.split('?')[0]; 
      row = row.previousElementSibling;
    }
    return '';
  }

  function smartSalesRep(doc = document) {
    const repSelect = doc.getElementById('ctl00_customSalesReps') || doc.getElementById('ctl00_DropDownSalesRep');
    if (repSelect && repSelect.selectedIndex >= 0) {
      const opt = repSelect.options[repSelect.selectedIndex];
      if (opt.value !== "0" && opt.text !== "Not Set" && opt.text !== "Not Selected" && opt.text.toLowerCase() !== "online") {
        return opt.text.trim();
      }
    }
    if (__gbBroadcastedSalesRep) return __gbBroadcastedSalesRep;
    return '';
  }

  function smartMessageId(doc = document) {
    const spans = doc.querySelectorAll('span');
    for (const span of spans) {
      const m = span.textContent.match(/messageID\s*:\s*([0-9a-f-]{36})/i);
      if (m) return m[1];
    }
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/(?:editOrderMessageID|messageID)=([0-9a-f-]{36})/i);
      if (m) return m[1];
    }
    const bodyHtml = doc.body.innerHTML || '';
    const m = bodyHtml.match(/messageID[^>]*>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return m ? m[1] : '';
  }

  function smartOrderNumber(doc = document) {
    const bodyText = doc.body.innerText || doc.body.textContent || '';
    for (const p of [
      /order\s*#\s*(\d{4,})/i,
      /order\s+(?:number|no\.?)[:\s#]+(\d{4,})/i,
      /(?:^|\s)#(\d{5,})(?:\s|$)/m,
      /order[:\s]+(\d{4,})/i
    ]) {
      const m = bodyText.match(p); if (m) return m[1];
    }
    const m = (doc === document ? location.href : '').match(/(?:order|orders)[\/=](\d{4,})/i);
    return m ? m[1] : '';
  }

  function smartUserId(doc = document) {
    const iframe = doc.getElementById('ccaiFrame');
    if (iframe) {
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      const m = src.match(/userId=(\d+)/);
      if (m) return m[1];
    }
    for (const el of doc.querySelectorAll('[onclick]')) {
      const oc = el.getAttribute('onclick') || '';
      const m = oc.match(/userId=(\d+)/);
      if (m) return m[1];
    }
    for (const el of doc.querySelectorAll('[href]')) {
      const m = (el.getAttribute('href') || '').match(/userId=(\d+)/);
      if (m) return m[1];
    }
    return '';
  }

  function smartPageOrderTotal(doc = document) {
    const el = doc.getElementById('orderTotal');
    if (el) {
      const text = (el.innerText || el.textContent || '').replace(/[$,\s]/g, '');
      const n = parseFloat(text);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  function smartPageChargeTotal(doc = document) {
    for (const portlet of doc.querySelectorAll('.portlet.yellow, .portlet.box.yellow')) {
      const caption = portlet.querySelector('.caption');
      if (!caption || !caption.textContent.includes('Order Charges')) continue;
      for (const tr of portlet.querySelectorAll('tr')) {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) continue;
        const firstText = (cells[0].innerText || cells[0].textContent || '').trim();
        if (firstText.toLowerCase().includes('total charge')) {
          const amtCell = cells[1];
          if (amtCell) {
            const raw = (amtCell.innerText || amtCell.textContent || '').replace(/[$,\s]/g, '');
            const n = parseFloat(raw);
            if (!isNaN(n)) return n;
          }
        }
      }
    }
    return 0;
  }

  function smartPageChargeRows(doc = document) {
    const rows = [];
    for (const portlet of doc.querySelectorAll('.portlet.yellow, .portlet.box.yellow')) {
      const caption = portlet.querySelector('.caption');
      if (!caption || !caption.textContent.includes('Order Charges')) continue;
      for (const tr of portlet.querySelectorAll('tbody tr')) {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) continue;
        const text = c => (c.innerText || c.textContent || '').replace(/\u00a0/g, ' ').trim();
        const firstText = text(cells[0]).toLowerCase();
        if (firstText.includes('total charge') || cells[0].hasAttribute('colspan') ||
            parseInt(cells[0].getAttribute('colspan') || '1') > 1) continue;
        const amtRaw = text(cells[6]).replace(/[$,]/g, '');
        const amount = parseFloat(amtRaw);
        if (isNaN(amount)) continue;
        rows.push({ trans: text(cells[0]), note: text(cells[1]), dateTime: text(cells[2]), cardHolder: text(cells[3]), type: text(cells[4]), last4: text(cells[5]), amount });
      }
      break; 
    }
    return rows;
  }

  function smartPaymentLink(doc = document) {
    for (const a of doc.querySelectorAll('a[href]')) {
      const t = (a.innerText || a.textContent || '').toLowerCase();
      if (t.includes('add payment') || t.includes('payment to order') || t.includes('update payment')) {
        try { return new URL(a.getAttribute('href'), location.href).href; }
        catch { return a.getAttribute('href') || ''; }
      }
    }
    return '';
  }

  function getOOSItemNames(doc = document) {
    const names = new Set();
    const candidates = doc.querySelectorAll('span, td, div, p');
    
    for (const el of candidates) {
      const raw = (el.innerText || el.textContent || '');
      if (!/\boos\b/i.test(raw)) continue;
      
      const row = el.closest('tr');
      if (!row) continue;
      
      let searchEl = row;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!searchEl) break;
        const a = searchEl.querySelector('a.nodes') || searchEl.querySelector('a[href*=".htm"]');
        if (a) {
          const itemName = (a.innerText || a.textContent || '').trim();
          if (itemName) names.add(itemName);
          break; 
        }
        searchEl = searchEl.nextElementSibling;
      }
    }
    return [...names].join('\n');
  }

  const BRAND_PAGE_MAP = [
    { keywords: ['titleist'],                              slug: 'Titleist'      },
    { keywords: ['callaway'],                              slug: 'Callaway-Golf' },
    { keywords: ['taylormade', 'taylor made', 'taylor-made'], slug: 'Taylor-Made'  },
    { keywords: ['bridgestone'],                           slug: 'Bridgestone'   },
    { keywords: ['srixon'],                                slug: 'Srixon'        },
    { keywords: ['mizuno'],                                slug: 'Mizuno'        },
    { keywords: ['pxg'],                                   slug: 'PXG'           },
    { keywords: ['pinnacle'],                              slug: 'Pinnacle'      },
    { keywords: ['venture'],                               slug: 'Venture-Golf'  },
    { keywords: ['wilson'],                                slug: 'Wilson'        },
  ];

  function detectBrandSlug(name) {
    const lower = name.toLowerCase();
    for (const { keywords, slug } of BRAND_PAGE_MAP) {
      if (keywords.some(kw => lower.includes(kw))) return slug;
    }
    return null;
  }

  function getStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (s1 === s2) return 1;
    if (s1.length < 2 || s2.length < 2) return 0;

    let bigrams1 = new Set();
    for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
    
    let bigrams2 = new Set();
    for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.substring(i, i + 2));

    let intersection = 0;
    for (let bg of bigrams1) {
      if (bigrams2.has(bg)) intersection++;
    }
    return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
  }

  function buildTargetProfile(oosName, catalogProducts) {
    const profile = { name: oosName, price: null, decorations: [] };
    const exactMatch = catalogProducts.find(p => p.title_s && p.title_s.toLowerCase() === oosName.toLowerCase());
    
    if (exactMatch) {
      profile.price = exactMatch.price_d;
      profile.decorations = exactMatch.modificationName_ss || [];
    } else {
      const lowerName = oosName.toLowerCase();
      if (lowerName.includes('personalized')) profile.decorations.push('Personalized');
      if (lowerName.includes('monogram')) profile.decorations.push('Monogram');
      if (lowerName.includes('photo')) profile.decorations.push('Photo');
      if (lowerName.includes('custom logo') || lowerName.includes('logo overrun')) profile.decorations.push('Custom Logo');
    }
    return profile;
  }

  function scoreCandidate(oosProfile, candidate) {
    let score = 0;
    const candTitle = candidate.title_s || '';

    const nameSim = getStringSimilarity(oosProfile.name, candTitle);
    score += (nameSim * 50);

    if (oosProfile.price && candidate.price_d) {
      const priceDiff = Math.abs(oosProfile.price - candidate.price_d);
      const priceRatio = Math.max(0, 1 - (priceDiff / 15)); 
      score += (priceRatio * 30);
    }

    if (oosProfile.decorations.length > 0 && candidate.modificationName_ss) {
      const candidateDecs = new Set(candidate.modificationName_ss);
      const matchingDecs = oosProfile.decorations.filter(d => candidateDecs.has(d));
      const decRatio = matchingDecs.length / oosProfile.decorations.length;
      score += (decRatio * 20);
    } else if (oosProfile.decorations.length === 0) {
      if (!candidate.modificationName_ss || candidate.modificationName_ss.includes('None')) score += 10; 
    }
    return score;
  }

  function fetchBrandProducts(slug) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'fetchBrandProducts', slug }, (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) resolve([]);
        else resolve(resp.products || []);
      });
    });
  }

  async function getRecommendedReplacement(doc = document) {
    const rawOOS = getOOSItemNames(doc); 
    const oosNames = rawOOS.split('\n').filter(Boolean);
    if (!oosNames.length) return '';

    const results   = [];
    const seenSlugs = {}; 

    for (const oosName of oosNames) {
      const slug = detectBrandSlug(oosName);
      if (!slug) continue;

      if (!seenSlugs[slug]) seenSlugs[slug] = await fetchBrandProducts(slug);

      const products = seenSlugs[slug] || [];
      if (!products.length) continue;

      const targetProfile = buildTargetProfile(oosName, products);

      const candidates = products.filter(p => {
        const title = (p.title_s || '').toLowerCase().trim();
        const targetTitle = oosName.toLowerCase().trim();
        return title !== targetTitle && getStringSimilarity(title, targetTitle) < 0.95;
      });

      if (!candidates.length) continue;

      let best      = null;
      let bestScore = -1;

      for (const c of candidates) {
        const s = scoreCandidate(targetProfile, c);
        if (s > bestScore) { bestScore = s; best = c; }
      }

      if (best) {
        const url = `https://www.golfballs.com${best.product_url_s}.htm`;
        results.push(`${slug} ${best.title_s} — ${url}`);
      }
    }
    return results.join('\n');
  }

  function smartPageType(doc = document) {
    const url = (doc === document ? window.location.href : '');
    if (/[?&]page=ViewOrder/i.test(url) && /[?&]orderID=/i.test(url)) return 'order';
    if (/[?&]Page=240\b/i.test(url)) return 'contact';
    if (/[?&]Page=271\b/i.test(url)) return 'account';
    if (doc.getElementById('tbContactId')) return 'contact';
    if (/[?&]accountID=\d+/i.test(url)) return 'account';
    if (/[?&]customerID=\d+/i.test(url)) return 'contact';
    return 'other';
  }

  function smartContactId(doc = document) {
    const m = (doc === document ? window.location.href : '').match(/[?&]customerID=(\d+)/i);
    if (m) return m[1];
    const el = doc.getElementById('tbContactId');
    if (el?.value) return el.value;
    return '';
  }

  function smartAccountId(doc = document) {
    const m = (doc === document ? window.location.href : '').match(/[?&]accountID=(\d+)/i);
    if (m) return m[1];
    const el = doc.getElementById('AccountID');
    if (el?.value && el.value !== '0') return el.value;
    return '';
  }

  function smartPageVariables(doc = document) {
    const v = {};
    const val = id => {
      const el = doc.getElementById(id);
      if (!el) return '';
      return (el.value || el.getAttribute('value') || el.textContent || '').trim();
    };
    const findStat = label => {
      const th = [...doc.querySelectorAll('th')].find(el => el.textContent.trim() === label);
      return th?.nextElementSibling?.textContent.trim() || '';
    };

    v.firstName       = val('lblContactFirstName') || val('tbContactFirstName');
    v.lastName        = val('lblContactLastName') || val('tbContactLastName');
    v.middleInit      = val('lblContactMiddleInit') || val('tbContactMiddleInit');
    v.fullName        = [v.firstName, v.middleInit, v.lastName].filter(Boolean).join(' ');
    v.companyName     = val('lblContactCompanyName') || val('tbContactCompanyName');
    v.jobTitle        = val('lblContactJobTitle') || val('tbContactJobTitle');
    v.contactEmail    = val('lblContactEmail') || val('tbContactEmailAddress');
    v.phoneNumber     = val('lblContactPhoneNumber') || val('tbContactPhoneNumber');
    v.zipCode         = val('lblContactZipCode') || val('tbContactZipCode');
    v.contactId       = val('tbContactId') || val('tbContactID');

    v.accountName     = val('Name');
    v.accountId       = val('AccountID');
    v.webAddress      = val('AccountWebAddress');
    v.mainAddress     = val('MainAddress');
    v.mainCity        = val('MainCity');
    v.mainState       = val('MainState') || val('lblContactMainState');
    v.mainZip         = val('MainPostal');
    v.mainCountry     = val('MainCountry') || val('lblContactUserCountry');
    v.creditApproved  = val('ApprovedDate');
    v.creditReqs      = val('CreditRequirements');
    v.linkedIn        = val('LinkedInURL') || val('lblContactCustomDataLinkedInURL');
    v.createdBy       = val('CreatedByAsName');

    const repSel = doc.getElementById('ddlSalesRepId');
    v.salesRep = repSel ? (repSel.options[repSel.selectedIndex]?.text?.trim() || '') : '';

    const typeSel = doc.getElementById('ddlUserTypeId');
    v.userType = typeSel ? (typeSel.options[typeSel.selectedIndex]?.text?.trim() || '') : '';

    v.orderCount      = findStat('Order Count');
    v.totalRevenue    = findStat('Total Revenue');
    v.lastOrderDate   = findStat('Last Order Date');
    v.priorYearRev    = findStat('Prior Year Revenue');
    v.ytdRevenue      = findStat('Year-To-Date Revenue');
    v.avgOrderSize    = findStat('Avg Order Size');
    v.creationDate    = findStat('Creation Date');

    const taskRows = doc.querySelectorAll('tr[id^="taskrow_"]');
    for (const row of taskRows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const status = cells[2]?.textContent.trim();
        if (status !== 'Complete') {
          v.nextTaskName = cells[0]?.textContent.trim() || '';
          v.nextTaskDue  = cells[4]?.textContent.trim() || '';
          break;
        }
      }
    }
    if (!v.nextTaskName) v.nextTaskName = '';
    if (!v.nextTaskDue)  v.nextTaskDue  = '';

    const emailRows = doc.querySelectorAll('tr[data-gbep="1"]');
    if (emailRows.length > 0) {
      const cells = emailRows[0].querySelectorAll('td');
      v.lastEmailFrom    = cells[1]?.textContent.trim() || '';
      v.lastEmailTo      = cells[2]?.textContent.trim() || '';
      v.lastEmailSubject = cells[3]?.textContent.trim() || '';
      v.lastEmailDate    = cells[4]?.textContent.trim() || '';
    } else {
      v.lastEmailFrom = v.lastEmailTo = v.lastEmailSubject = v.lastEmailDate = '';
    }

    const now = new Date();
    v.today       = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
    v.todayLong   = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    if (v.lastOrderDate) {
      const d = new Date(v.lastOrderDate);
      if (!isNaN(d)) v.daysSinceLastOrder = String(Math.floor((now - d) / 864e5));
    }
    if (!v.daysSinceLastOrder) v.daysSinceLastOrder = '';

    return v;
  }

  function checkAccountConditions(conditions, doc = document) {
    if (!conditions || conditions.length === 0) return true;

    const pageVars = smartPageVariables(doc);
    const allTh = [...doc.querySelectorAll('th')];
    const findStat = label => {
      const th = allTh.find(el => el.textContent.trim() === label);
      return th?.nextElementSibling?.textContent.trim() || null;
    };

    const raw = {
      ...pageVars, 
      orderCount_i:        findStat('Order Count'),
      lastOrderDate_dt:    findStat('Last Order Date'),
      priorYearRevenue_f:  findStat('Prior Year Revenue'),
      yearToDateRevenue_f: findStat('Year-To-Date Revenue'),
      salesRep_s:          pageVars.salesRep || null,
    };

    const actRows = [...doc.querySelectorAll('#ActivityTable tbody tr')];
    const emailRow = actRows.find(r => {
      const dir = r.cells[3]?.textContent.trim();
      return dir === 'Out' || dir === 'Sent';
    });
    raw.lastEmailDate_dt = emailRow ? emailRow.cells[5]?.textContent.trim() : null;

    const parseNum  = v => v != null ? parseFloat(String(v).replace(/[$,]/g, '')) : null;
    const parseDate = v => v ? new Date(v) : null;
    const now       = new Date();
    const UNIT_MS   = { days: 864e5, weeks: 7*864e5, months: 30*864e5, years: 365*864e5 };

    for (const cond of conditions) {
      const { field, op, num, unit } = cond;
      let { val } = cond;
      const rawVal = raw[field];

      if (typeof val === 'string' && val.includes('{{')) {
        val = val.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
          return raw[varName] !== undefined ? raw[varName] : '';
        });
      }

      if (op === 'exists')     { if (!rawVal) return false; continue; }
      if (op === 'not_exists') { if ( rawVal) return false; continue; }
      if (rawVal == null)      return false; 

      if (field.endsWith('_dt')) {
        const d = parseDate(rawVal);
        if (!d) return false;
        const ms = (UNIT_MS[unit] || UNIT_MS.days) * parseFloat(num || 1);
        if (op === 'rel_before'   && !(d < new Date(now - ms)))                          return false;
        if (op === 'rel_after'    && !(d >= new Date(now - ms)))                         return false;
        if (op === 'before'       && !(d < new Date(val)))                               return false;
        if (op === 'after'        && !(d > new Date(val)))                               return false;
        if (op === 'before_today' && !(d < new Date(now.toDateString())))                return false;
        if (op === 'after_today'  && !(d > new Date(now.toDateString())))                return false;
        continue;
      }

      if (field.endsWith('_i') || field.endsWith('_f')) {
        const nv = parseNum(rawVal), cv = parseFloat(val);
        if (nv == null) return false;
        if (op === 'eq'  && !(nv === cv)) return false;
        if (op === 'ne'  && !(nv !== cv)) return false;
        if (op === 'gt'  && !(nv >   cv)) return false;
        if (op === 'gte' && !(nv >=  cv)) return false;
        if (op === 'lt'  && !(nv <   cv)) return false;
        if (op === 'lte' && !(nv <=  cv)) return false;
        continue;
      }

      const sv = String(rawVal).toLowerCase(), cv2 = String(val||'').toLowerCase();
      if (op === 'is'       && sv !== cv2)           return false;
      if (op === 'contains' && !sv.includes(cv2))    return false;
    }
    return true;
  }
}