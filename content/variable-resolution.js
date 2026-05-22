// variable-resolution.js — template variable resolution + rule evaluation
// Depends on: smart-detection.js

// ═══════════════════════════════════════════════════════
  // VARIABLE RESOLUTION
  // ═══════════════════════════════════════════════════════

  /**
   * Resolves a single template variable against the current page using the
   * variable's type definition. Supports `builtin`, `selector`, and `regex`
   * variable types. The `recommended_replacement` builtin is async and must
   * be resolved via resolveAllVarsAsync instead.
   * @param {string} name - The variable name (unused; kept for call consistency).
   * @param {{type:string, builtin?:string, selector?:string, attr?:string, source?:string, scope?:string, pattern?:string, flags?:string, group?:number}} def - Variable definition object.
   * @param {Document} doc - The document to scan (defaults to global document).
   * @returns {string} The resolved value, or empty string on failure.
   */
  function resolveVar(name, def, doc = document) {
    try {
      switch (def.type) {
        case 'builtin':
          if (def.builtin === 'email')        return typeof smartEmail === 'function' ? smartEmail(doc) : '';
          if (def.builtin === 'order_number') return typeof smartOrderNumber === 'function' ? smartOrderNumber(doc) : '';
          if (def.builtin === 'payment_link') return typeof smartPaymentLink === 'function' ? smartPaymentLink(doc) : '';
          if (def.builtin === 'oos_item')     return typeof getOOSItemNames === 'function' ? getOOSItemNames(doc) : '';
          
          // Checks for Account built-ins (firstName, salesRep, etc.)
          if (typeof smartPageVariables === 'function') {
            const pageVars = smartPageVariables(doc);
            if (pageVars[def.builtin] !== undefined) return pageVars[def.builtin];
          }
          return '';

        case 'selector': {
          const el = doc.querySelector(def.selector);
          if (!el) return '';
          if (def.attr) return el.getAttribute(def.attr) || '';
          return (doc === document && typeof getTextOf === 'function') ? getTextOf(el) : (el.innerText || el.textContent || '').trim();
        }

        case 'regex': {
          let src = '';
          if (def.source === 'html') {
            src = def.scope
              ? (doc.querySelector(def.scope)?.innerHTML || '')
              : doc.body.innerHTML;
          } else {
            src = def.scope
              ? ((doc === document && typeof getTextOf === 'function') ? getTextOf(doc.querySelector(def.scope)) : (doc.querySelector(def.scope)?.innerText || doc.querySelector(def.scope)?.textContent || ''))
              : (doc.body.innerText || doc.body.textContent || '');
          }
          const rx = new RegExp(def.pattern, def.flags || 'i');
          const m  = src.match(rx);
          if (!m) return '';
          const g = def.group != null ? Number(def.group) : 1;
          return m[g] !== undefined ? m[g] : (m[0] || '');
        }

        default: return '';
      }
    } catch { return ''; }
  }

  /**
   * Resolves all template variables for a given template asynchronously,
   * handling the `recommended_replacement` builtin which requires a network
   * call. Also resolves the recipient email from the `toField` definition.
   * @param {Object.<string,object>} vars - Map of variable name to definition.
   * @param {{type:string, value?:string, selector?:string}} toField - The To-field definition.
   * @param {Document} doc - The document to scan (defaults to global document).
   * @returns {Promise<{resolved:Object.<string,string>, toEmail:string}>}
   */
  async function resolveAllVarsAsync(vars, toField, doc = document) {
    const resolved = {};
    for (const [name, def] of Object.entries(vars || {})) {
      if (def.type === 'builtin' && def.builtin === 'recommended_replacement') {
        try { resolved[name] = await getRecommendedReplacement(doc); }
        catch { resolved[name] = ''; }
      } else {
        resolved[name] = resolveVar(name, def, doc);
      }
    }

    let toEmail = '';
    try {
      if (!toField || toField.type === 'auto') {
        toEmail = typeof smartEmail === 'function' ? smartEmail(doc) : '';
        // Failover to contact Email if basic regex fails
        if (!toEmail && typeof smartPageVariables === 'function') {
            toEmail = smartPageVariables(doc).contactEmail || '';
        }
      } else if (toField.type === 'literal') {
        toEmail = toField.value || '';
      } else if (toField.type === 'selector') {
        const el  = doc.querySelector(toField.selector);
        const raw = el ? ((doc === document && typeof getTextOf === 'function') ? getTextOf(el) : (el.innerText || el.textContent || '')) : '';
        const m   = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        toEmail = m ? m[0] : raw;
      }
    } catch {}

    return { resolved, toEmail };
  }

  // ═══════════════════════════════════════════════════════
  // RULE EVALUATION
  // ═══════════════════════════════════════════════════════

  /**
   * Evaluates an array of auto-match rules against the current page. Every
   * rule in the array must pass (AND logic). Supports equals, contains,
   * startsWith, endsWith, exists, and notExists operators.
   * @param {Array<{selector:string, operator:string, value:string}>} rules - Rules to evaluate.
   * @param {Document} doc - The document to scan (defaults to global document).
   * @returns {boolean} True when all rules match (or the array is empty).
   */
  function checkRules(rules, doc = document) {
    if (!rules || rules.length === 0) return false;
    return rules.every(({ selector, operator, value }) => {
      let elText = '';
      try { 
        const el = doc.querySelector(selector); 
        elText = el ? ((doc === document && typeof getTextOf === 'function') ? getTextOf(el).toLowerCase() : (el.innerText || el.textContent || '').toLowerCase()) : ''; 
      } catch {}
      const val = (value || '').toLowerCase().trim();
      switch (operator) {
        case 'equals':     return elText === val;
        case 'contains':   return elText.includes(val);
        case 'startsWith': return elText.startsWith(val);
        case 'endsWith':   return elText.endsWith(val);
        case 'exists':     return elText.length > 0;
        case 'notExists':  return elText.length === 0;
        default:           return false;
      }
    });
  }

  // ═══════════════════════════════════════════════════════