// date-utils.js — ASP.NET date offset math + calendar cell date parser

  // The Calendar control uses "days since Jan 1, 2000" (0-indexed) as __EVENTARGUMENT.
  // Verified: April 1, 2026 → 9587, April 12, 2026 → 9598 ✓
  /**
   * Converts a JavaScript Date to the ASP.NET Calendar control's integer
   * offset format (days since 2000-01-01 UTC), which is passed as the
   * `__EVENTARGUMENT` in calendar postback requests.
   * @param {Date} date - The date to convert.
   * @returns {number} Integer day offset from 2000-01-01.
   */
  function __gbDateToAspOffset(date) {
    const base   = Date.UTC(2000, 0, 1);
    const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((target - base) / 86400000);
  }

  // ── Extract currently-selected date from an ASP.NET Calendar control ──
  // Returns "MM/DD/YYYY" if highlighted, or null (never falls back to "today").
  /**
   * Reads the currently highlighted date from an ASP.NET Calendar control by
   * inspecting the silver/highlighted cell style. Never falls back to "today"
   * — returns null when no date is selected.
   * @param {string} selectorID - The element ID of the Calendar table.
   * @param {Document} doc - The document (or parsed HTML document) containing the calendar.
   * @returns {string|null} Selected date as "MM/DD/YYYY", or null if none selected.
   */
  function __gbParseDateFromCell(selectorID, doc) {
    const table = doc.getElementById(selectorID);
    if (!table) return null;
    let year = new Date().getFullYear();
    const tds = Array.from(table.querySelectorAll('td'));
    const headerTd = tds.find(td => /^[A-Za-z]+\s\d{4}$/.test((td.textContent || '').trim()));
    if (headerTd) {
      const match = (headerTd.textContent || '').match(/\d{4}/);
      if (match) year = match[0];
    }
    const links = Array.from(table.querySelectorAll('a[title]'));
    for (const a of links) {
      const titleStr = (a.getAttribute('title') || '').trim();
      if (!titleStr || titleStr.toLowerCase().includes('month')) continue;
      const td = a.closest('td');
      if (!td) continue;
      const tdStyle = (td.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
      const tdBg    = (td.getAttribute('bgcolor') || '').toLowerCase();
      const aStyle  = (a.getAttribute('style')   || '').toLowerCase().replace(/\s/g, '');
      if (tdStyle.includes('silver') || tdStyle.includes('#c0c0c0') || tdBg === 'silver' || aStyle.includes('white')) {
        const finalDate = new Date(titleStr + ', ' + year);
        if (!isNaN(finalDate.getTime())) {
          const mm   = String(finalDate.getMonth() + 1).padStart(2, '0');
          const dd   = String(finalDate.getDate()).padStart(2, '0');
          const yyyy = finalDate.getFullYear();
          return mm + '/' + dd + '/' + yyyy;
        }
      }
    }
    return null;
  }

