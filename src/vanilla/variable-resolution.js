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

        /* Schema-driven path lookup. Defs look like
              { type: 'schema', path: 'contact.firstName' }   (user-facing)
              { type: 'path',   path: 'contact.firstName' }   (legacy alias)
           Both resolve through window.__gbPageEngine which detects
           the page's schema (contact / account variant of the
           unified CRM schema), runs extraction once (memoized per
           doc), and walks the path against the JSON. Returns ''
           when no schema matched the doc OR the path doesn't
           resolve — same failure shape as the legacy kinds so
           smart-options fallback still applies cleanly. */
        case 'schema':
        case 'path': {
          if (!def.path) return '';
          const engine = (typeof window !== 'undefined' && window.__gbPageEngine) || null;
          if (!engine) return '';
          const raw = engine.resolvePath(doc, def.path, '');
          /* Path resolver returns the raw typed value (number / date
             / bool); coerce to string for downstream template
             substitution. Code vars that want typed access call the
             engine directly. */
          return engine.toDisplayString(raw);
        }

        /* New: sandboxed code variable. Defs look like
              { type: 'code', body: 'return ctx.contact.firstName.toUpperCase();' }
           We use the synchronous variant — bodies typically just
           walk ctx and format. resolveAllVarsAsync handles the
           async variant when the body needs it (signaled by `async`
           on the def). */
        case 'code': {
          if (!def.body) return '';
          const engine = (typeof window !== 'undefined' && window.__gbPageEngine) || null;
          if (!engine) return '';
          try {
            const raw = engine.evaluateCodeSync(doc, def.body);
            return engine.toDisplayString(raw);
          } catch (e) {
            /* Surface the compile/runtime error inside the rendered
               value so the rep notices and fixes the template,
               rather than silently emitting an empty string. */
            return `<code-var error: ${e.message}>`;
          }
        }

        /* A literal variable is fixed text — there's nothing to resolve,
           so it must return its own value (was falling through to the
           default '' and showing as "unresolved"). The value lives in
           `value` (canonical) or `config`/`literal` (editor shapes). */
        case 'literal':
          return def.value   != null ? String(def.value)
               : def.config  != null ? String(def.config)
               : def.literal != null ? String(def.literal)
               : '';

        default: return '';
      }
    } catch { return ''; }
  }

  /* Find which OTHER variables a code body reads via `vars.foo` /
     vars['foo']. Only names that actually exist in the template count
     as dependencies (a stray `vars.whatever` isn't an edge). This is
     what lets the resolver run code blocks in the right order without
     the author hand-declaring an order. */
  function parseVarDeps(body, knownNames) {
    const deps = new Set();
    if (typeof body !== 'string' || !body) return deps;
    const dot = /\bvars\s*\.\s*([A-Za-z_$][\w$]*)/g;
    const idx = /\bvars\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
    let m;
    while ((m = dot.exec(body))) if (knownNames.has(m[1])) deps.add(m[1]);
    while ((m = idx.exec(body))) if (knownNames.has(m[1])) deps.add(m[1]);
    return deps;
  }

  /* Topologically order the variables so every code block runs AFTER the
     variables it references. Stable: among ready nodes we keep insertion
     order, so a template with no cross-references resolves exactly as
     before. Cycles / refs to missing vars are appended last (best-effort
     — they just see whatever resolved before them). */
  function orderVars(vars) {
    const names = Object.keys(vars || {});
    const known = new Set(names);
    const deps = new Map();
    for (const n of names) {
      const d = vars[n];
      const body = d && d.type === 'code' ? (d.body || '') : '';
      const ds = parseVarDeps(body, known);
      ds.delete(n);
      deps.set(n, ds);
    }
    const order = [];
    const done = new Set();
    let progress = true;
    while (order.length < names.length && progress) {
      progress = false;
      for (const n of names) {
        if (done.has(n)) continue;
        let ready = true;
        for (const dn of deps.get(n)) if (!done.has(dn)) { ready = false; break; }
        if (ready) { order.push(n); done.add(n); progress = true; }
      }
    }
    for (const n of names) if (!done.has(n)) order.push(n);
    return order;
  }

  /**
   * Resolves all template variables for a given template asynchronously,
   * handling the `recommended_replacement` builtin which requires a network
   * call. Also resolves the recipient email from the `toField` definition.
   *
   * Variables resolve in DEPENDENCY ORDER (see orderVars): a code block can
   * read an earlier variable's resolved value via `vars.thatName`. Two views
   * are kept — `rawValues` carries the unstringified result (an object/array
   * is preserved intact) and is what later code blocks receive as `vars`;
   * `resolved` carries the display string used for template substitution.
   * @param {Object.<string,object>} vars - Map of variable name to definition.
   * @param {{type:string, value?:string, selector?:string}} toField - The To-field definition.
   * @param {Document} doc - The document to scan (defaults to global document).
   * @returns {Promise<{resolved:Object.<string,string>, toEmail:string}>}
   */
  async function resolveAllVarsAsync(vars, toField, doc = document, onProgress = null) {
    /* Backwards-compat guard. A template still carrying a flagged-
       deprecated variable (one the one-version migration couldn't lift
       onto the page engine) must not be sent silently — refuse so the rep
       fixes the template. Deprecated vars still RESOLVE in the editor
       preview (resolveVar); only this send path throws. */
    const deprecated = Object.entries(vars || {})
      .filter(([, d]) => d && d.deprecated)
      .map(([n]) => n);
    if (deprecated.length) {
      throw new Error(`Template uses deprecated variable${deprecated.length > 1 ? 's' : ''}: ${deprecated.join(', ')}. Open the template editor to fix.`);
    }

    /* Resolve the recipient FIRST and stream it out, so the popup paints To
       immediately (it's cheap — smart email off the page) while the code
       chain is still running. onProgress (when provided) lets callers show
       each variable the instant it resolves instead of one final batch. */
    let toEmail = '';
    try {
      if (!toField || toField.type === 'auto') {
        toEmail = typeof smartEmail === 'function' ? smartEmail(doc) : '';
        if (!toEmail && typeof smartPageVariables === 'function') toEmail = smartPageVariables(doc).contactEmail || '';
      } else if (toField.type === 'literal') {
        toEmail = toField.value || '';
      } else if (toField.type === 'selector') {
        const el  = doc.querySelector(toField.selector);
        const raw = el ? ((doc === document && typeof getTextOf === 'function') ? getTextOf(el) : (el.innerText || el.textContent || '')) : '';
        const m   = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        toEmail = m ? m[0] : raw;
      }
    } catch {}
    if (typeof onProgress === 'function') { try { onProgress({ kind: 'to', value: toEmail }); } catch {} }
    const engine = (typeof window !== 'undefined' && window.__gbPageEngine) || null;
    const resolved = {};      // name → display string (template substitution)
    const rawValues = {};     // name → raw value (objects intact; fed to later code blocks as `vars`)
    for (const name of orderVars(vars)) {
      const def = (vars || {})[name];
      let raw;        // raw value for chaining
      let display;    // string for the resolved map
      if (def.type === 'builtin' && def.builtin === 'recommended_replacement') {
        try { raw = await getRecommendedReplacement(doc); }
        catch { raw = ''; }
        display = raw;
      } else if (def.type === 'code') {
        /* ALL code variables resolve through engine.evaluateCode, which
           runs the body in a sandboxed iframe — MV3 forbids `new Function`
           in the content-script world, so the old sync path (resolveVar →
           evaluateCodeSync) is CSP-blocked. The async engine call is the
           only one that works on a live page. We pass the values resolved
           BEFORE this one so the body can read `vars.earlierName`. */
        if (!engine) { raw = ''; display = ''; }
        else {
          try {
            const value = await engine.evaluateCode(doc, def.body || '', rawValues);
            raw = value;                              // keep intact (could be an object/array) for downstream vars
            display = engine.toDisplayString(value);  // stringify only for template substitution
          } catch (e) {
            raw = ''; display = `<code-var error: ${e.message}>`;
          }
        }
      } else {
        raw = resolveVar(name, def, doc);
        display = raw;
      }
      rawValues[name] = raw;
      /* ── TEMP DEBUG (catalog-match diagnosis) — remove when fixed ── */
      try {
        const preview = (raw && typeof raw === 'object') ? raw : String(raw).slice(0, 200);
        console.log(`[GB var-debug] ${name} (${def.type}) =`, preview);
      } catch {}
      /* Smart options run BEFORE any per-variable validation that
         consumers downstream might apply. Order is load-bearing:
         a path field marked `validate.required` would otherwise
         emit an "empty" warning for a value that smart.fallback
         is about to fill in, surprising the user. The schema-level
         validation that runs inside extract.js is informational
         (warnings carried on the ctx); the AUTHORITATIVE value the
         renderer sees is the one returned here — post-smart. */
      resolved[name] = applySmart(display, def);
      /* Stream this variable the instant it's done — the popup clears its
         spinner and shows the value without waiting for the rest. */
      if (typeof onProgress === 'function') {
        try { onProgress({ kind: 'var', name, value: resolved[name] }); } catch {}
      }
    }

    /* ── TEMP DEBUG — persist the whole resolved set so __gbDownloadDebug()
       can export it as a JSON file (resolution runs on the CRM page, not the
       popup, so a file is easier to collect than cross-page console). ── */
    try {
      if (typeof window !== 'undefined') window.__gbVarDebug = rawValues;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ gbVarsDebug: { ts: Date.now(), url: (typeof location !== 'undefined' ? location.href : ''), vars: rawValues } });
      }
    } catch {}

    return { resolved, toEmail };
  }

  // ═══════════════════════════════════════════════════════
  // SMART OPTIONS — fallback, transform, format, conditional
  // ═══════════════════════════════════════════════════════

  /** Apply a transform tag (matches TRANSFORMS in SmartModal.jsx). */
  function applyTransform(v, kind) {
    if (typeof v !== 'string' || !v) return v;
    switch (kind) {
      case 'upper':      return v.toUpperCase();
      case 'lower':      return v.toLowerCase();
      case 'titleCase':  return v.replace(/\b[a-z]/g, (c) => c.toUpperCase());
      case 'capitalize': return v.charAt(0).toUpperCase() + v.slice(1);
      case 'trim':       return v.trim();
      case 'firstWord':  return v.trim().split(/\s+/)[0] || '';
      default:           return v;
    }
  }

  /** Parse the decimal-precision out of a pattern like "$#,##0.00". */
  function _decimalsFromPattern(pattern) {
    const m = pattern && pattern.match(/\.(0+)/);
    return m ? m[1].length : null;
  }

  /** Apply a format descriptor — number / currency / date / percent. */
  function applyFormat(v, format) {
    if (!format || !format.type || format.type === 'none') return v;
    const pattern = format.pattern || '';
    if (format.type === 'number' || format.type === 'currency' || format.type === 'percent') {
      const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(n)) return v;
      const decimals = _decimalsFromPattern(pattern);
      const opts = decimals != null
        ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
        : {};
      if (format.type === 'currency') {
        return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', ...opts });
      }
      if (format.type === 'percent') {
        // 0–1 → multiply; >1 assumed already a percent.
        const pct = (n >= -1 && n <= 1) ? n * 100 : n;
        return pct.toLocaleString(undefined, opts) + '%';
      }
      return n.toLocaleString(undefined, opts);
    }
    if (format.type === 'date') {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return v;
      if (!pattern) return d.toLocaleDateString();
      const pad = (n) => String(n).padStart(2, '0');
      return pattern
        .replace(/yyyy/g, d.getFullYear())
        .replace(/MM/g,   pad(d.getMonth() + 1))
        .replace(/dd/g,   pad(d.getDate()))
        .replace(/HH/g,   pad(d.getHours()))
        .replace(/mm/g,   pad(d.getMinutes()))
        .replace(/ss/g,   pad(d.getSeconds()));
    }
    return v;
  }

  /** Extract a regex capture group from the value — a Smart transform for
      order/account templates that used to expose regex as a primary kind. */
  function applyExtract(v, extract) {
    if (!extract || !extract.pattern || typeof v !== 'string' || !v) return v;
    try {
      const rx = new RegExp(extract.pattern, extract.flags || '');
      const m  = v.match(rx);
      if (!m) return '';
      const g = extract.group != null ? Number(extract.group) : 1;
      return m[g] !== undefined ? m[g] : (m[0] || '');
    } catch { return v; }
  }

  /** fallback → extract → transform → format. Empty + no fallback returns ''. */
  function applySmart(value, def) {
    const smart = def && def.smart;
    if (!smart) return value;
    let v = value;
    if ((v === '' || v == null) && typeof smart.fallback === 'string' && smart.fallback.length > 0) {
      v = smart.fallback;
    }
    if (smart.extract)   v = applyExtract(v, smart.extract);
    if (smart.transform) v = applyTransform(v, smart.transform);
    if (smart.format)    v = applyFormat(v, smart.format);
    return v;
  }

  /**
   * Pre-process a template string: for any variable with smart.conditional
   * that resolves to an empty value, remove the surrounding sentence (or
   * paragraph / line, per smart.conditionalScope) so the body doesn't leak
   * an empty placeholder.
   *
   * Call BEFORE running the template through `.replace(/\{\{...\}\}/g, ...)`.
   */
  // NOTE: canonical implementation lives at src/lib/variableResolution.js.
  // Vanilla content scripts can't ESM-import, so we keep a parallel copy
  // here. Keep both in sync.
  function dropConditional(template, vars, resolved) {
    if (!template || !vars) return template || '';
    let out = String(template);
    for (const [name, def] of Object.entries(vars)) {
      const smart = def && def.smart;
      if (!smart || !smart.conditional) continue;
      const val = resolved ? resolved[name] : '';
      if (val != null && String(val).length > 0) continue;
      const placeholder = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scope = smart.conditionalScope || 'sentence';
      let rx;
      if (scope === 'paragraph') {
        // Drop the paragraph (run between blank lines) containing the placeholder.
        rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*(\\n\\n|\\n?$)`, 'g');
      } else if (scope === 'line') {
        rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*\\n?`, 'g');
      } else {
        // Sentence: from the prior boundary (.!?¶ start) up to and including
        // the next sentence-ending punctuation.
        rx = new RegExp(`(?:^|(?<=[.!?\\n]))\\s*[^.!?\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^.!?\\n]*[.!?]?\\s*`, 'g');
      }
      out = out.replace(rx, '');
    }
    return out;
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