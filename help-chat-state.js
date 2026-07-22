/**
 * Pure state model for the extension Help Companion.
 *
 * This file is a classic-script IIFE so the MV3 worker can load it with
 * importScripts(), while node:test can exercise the real implementation in a
 * vm. It deliberately contains no network or Chrome API calls.
 */
(function installHelpChatState(root) {
  'use strict';

  const STORAGE_KEY = 'gbHelpChatStateV1';
  const VERSION = 1;
  const MAX_MESSAGES = 40;
  const MAX_HISTORY = 12;
  const ACTIVE_STATUSES = new Set(['submitting', 'queued', 'running']);
  const ACTION_TYPES = new Set([
    'open_guide', 'open_settings', 'show_shortcut', 'copy_text',
    'set_feature', 'set_setting', 'set_theme_preset', 'set_theme_palette',
    'share_settings', 'share_email_template',
  ]);

  const bounded = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const safeId = (value, fallback = '') => {
    const id = bounded(value, 100);
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id) ? id : fallback;
  };

  function makeRequestId(now = Date.now()) {
    let random = '';
    try { random = root.crypto?.randomUUID?.().replace(/[^A-Za-z0-9-]/g, '') || ''; } catch { /* */ }
    if (!random) random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `help:${Math.max(0, finite(now)).toString(36)}:${random}`.slice(0, 80);
  }

  function emptyState(now = Date.now()) {
    return {
      version: VERSION,
      messages: [],
      active: null,
      unread: 0,
      lastError: null,
      notice: null,
      updatedAt: finite(now, Date.now()),
    };
  }

  function normalizeCitation(value) {
    if (!value || typeof value !== 'object') return null;
    const id = safeId(value.id);
    const title = bounded(value.title, 180);
    if (!id || !title) return null;
    return {
      id,
      title,
      kind: bounded(value.kind, 40),
      source: bounded(value.source, 240),
      guideRoute: bounded(value.guide_route ?? value.guideRoute, 240),
      excerpt: bounded(value.excerpt, 500),
    };
  }

  function normalizeAction(value) {
    if (!value || typeof value !== 'object') return null;
    const type = bounded(value.type, 40);
    const target = bounded(value.target, type === 'copy_text' ? 4_000 : 500);
    if (!ACTION_TYPES.has(type) || !target) return null;
    return {
      type,
      target,
      value: bounded(value.value, 500),
      options: Array.isArray(value.options)
        ? value.options.map((item) => bounded(item, 120)).filter(Boolean).slice(0, 16)
        : [],
      label: bounded(value.label, 100) || 'Open',
      citationId: safeId(value.citation_id ?? value.citationId),
    };
  }

  function normalizeAnswer(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const citations = Array.isArray(raw.citations)
      ? raw.citations.slice(0, 16).map(normalizeCitation).filter(Boolean)
      : [];
    const citationIds = new Set(citations.map((item) => item.id));
    const steps = Array.isArray(raw.steps) ? raw.steps.slice(0, 16).map((step) => {
      if (!step || typeof step !== 'object') return null;
      const text = bounded(step.text, 1_500);
      if (!text) return null;
      const ids = Array.isArray(step.citation_ids ?? step.citationIds)
        ? (step.citation_ids ?? step.citationIds).map((id) => safeId(id)).filter((id) => citationIds.has(id)).slice(0, 8)
        : [];
      return { text, citationIds: ids };
    }).filter(Boolean) : [];
    return {
      text: bounded(raw.text, 24_000),
      steps,
      citations,
      actions: Array.isArray(raw.actions) ? raw.actions.slice(0, 8).map(normalizeAction).filter(Boolean) : [],
      suggestedQuestions: Array.isArray(raw.suggested_questions ?? raw.suggestedQuestions)
        ? (raw.suggested_questions ?? raw.suggestedQuestions).map((item) => bounded(item, 240)).filter(Boolean).slice(0, 6)
        : [],
      warning: bounded(raw.warning, 500),
      confidence: Math.max(0, Math.min(1, finite(raw.confidence, 0))),
      needsMoreEvidence: raw.needs_more_evidence === true || raw.needsMoreEvidence === true,
      provider: bounded(raw.provider, 60),
      model: bounded(raw.model, 100),
    };
  }

  function normalizeMessage(value) {
    if (!value || typeof value !== 'object') return null;
    const role = value.role === 'assistant' ? 'assistant' : value.role === 'user' ? 'user' : '';
    if (!role) return null;
    const text = bounded(value.text ?? value.content, role === 'assistant' ? 24_000 : 4_000);
    if (!text) return null;
    const createdAt = Math.max(0, finite(value.createdAt ?? value.created_at));
    if (role === 'user') {
      const requestId = safeId(value.requestId ?? value.request_id);
      return {
        id: safeId(value.id, requestId ? `user:${requestId}`.slice(0, 100) : `user:${createdAt}`),
        role,
        text,
        requestId,
        createdAt,
      };
    }
    const runId = safeId(value.runId ?? value.run_id);
    const answer = normalizeAnswer({ ...value, text });
    return {
      id: safeId(value.id, runId ? `assistant:${runId}`.slice(0, 100) : `assistant:${createdAt}`),
      role,
      runId,
      createdAt,
      feedback: ['helpful', 'not_helpful'].includes(value.feedback) ? value.feedback : null,
      ...answer,
    };
  }

  function normalizeActive(value) {
    if (!value || typeof value !== 'object') return null;
    const status = bounded(value.status, 20).toLowerCase();
    const requestId = safeId(value.requestId ?? value.request_id);
    const runId = safeId(value.runId ?? value.run_id);
    if (!ACTIVE_STATUSES.has(status) || !requestId || (status !== 'submitting' && !runId)) return null;
    return {
      requestId,
      runId,
      status,
      startedAt: Math.max(0, finite(value.startedAt ?? value.started_at)),
      updatedAt: Math.max(0, finite(value.updatedAt ?? value.updated_at)),
      pollAfterMs: Math.max(1_000, Math.min(30_000, finite(value.pollAfterMs ?? value.poll_after_ms, 3_000))),
      nextPollAt: Math.max(0, finite(value.nextPollAt ?? value.next_poll_at)),
      attempts: Math.max(0, Math.min(20, Math.floor(finite(value.attempts, 0)))),
    };
  }

  function normalizeState(value, now = Date.now()) {
    const state = emptyState(now);
    if (!value || typeof value !== 'object') return state;
    state.messages = Array.isArray(value.messages)
      ? value.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
      : [];
    state.active = normalizeActive(value.active);
    state.unread = Math.max(0, Math.min(99, Math.floor(finite(value.unread, 0))));
    if (value.lastError && typeof value.lastError === 'object') {
      const message = bounded(value.lastError.message, 500);
      if (message) {
        state.lastError = {
          message,
          requestId: safeId(value.lastError.requestId ?? value.lastError.request_id),
          retryMessage: bounded(value.lastError.retryMessage ?? value.lastError.retry_message, 4_000),
          reuseRequestId: value.lastError.reuseRequestId === true || value.lastError.reuse_request_id === true,
          status: Math.max(0, Math.floor(finite(value.lastError.status, 0))),
          at: Math.max(0, finite(value.lastError.at)),
        };
      }
    }
    state.notice = bounded(value.notice, 240) || null;
    state.updatedAt = Math.max(0, finite(value.updatedAt, finite(now, Date.now())));
    return state;
  }

  function normalizeContext(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const featureStates = {};
    if (raw.feature_states && typeof raw.feature_states === 'object' && !Array.isArray(raw.feature_states)) {
      for (const [key, enabled] of Object.entries(raw.feature_states).slice(0, 80)) {
        const safeKey = bounded(key, 100);
        if (safeKey && typeof enabled === 'boolean') featureStates[safeKey] = enabled;
      }
    }
    const resources = Array.isArray(raw.available_resources)
      ? raw.available_resources.slice(0, 80).map((item) => {
        if (!item || typeof item !== 'object') return null;
        const kind = safeId(item.kind);
        const id = safeId(item.id);
        if (!kind || !id) return null;
        return { kind, id, label: bounded(item.label, 120) || id };
      }).filter(Boolean)
      : [];
    return {
      extension_version: bounded(raw.extension_version, 40) || undefined,
      edition: raw.edition === 'consumer' ? 'consumer' : 'admin',
      surface: bounded(raw.surface, 60) || undefined,
      guide_route: bounded(raw.guide_route, 240) || undefined,
      page_type: bounded(raw.page_type, 60) || undefined,
      page_url: /^https?:\/\//.test(String(raw.page_url || ''))
        ? bounded(raw.page_url, 500) || undefined
        : undefined,
      feature_states: featureStates,
      hidden_settings: Array.isArray(raw.hidden_settings)
        ? raw.hidden_settings.map((item) => bounded(item, 160)).filter(Boolean).slice(0, 160)
        : [],
      available_resources: resources,
    };
  }

  function buildRequest(stateValue, messageValue, context, requestId, { retry = false } = {}) {
    const state = normalizeState(stateValue);
    const message = bounded(messageValue, 4_000);
    const id = safeId(requestId);
    if (!message) throw new Error('Ask a question before sending');
    if (!id || id.length < 8) throw new Error('Invalid help request identifier');
    let source = state.messages;
    if (retry && source.at(-1)?.role === 'user' && source.at(-1)?.text === message) source = source.slice(0, -1);
    const history = source
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map((item) => ({ role: item.role, content: item.text.slice(0, 4_000) }));
    return { request_id: id, message, history, context: normalizeContext(context) };
  }

  function beginTurn(stateValue, { message, requestId, now = Date.now(), reuseLastUser = false } = {}) {
    const state = normalizeState(stateValue, now);
    if (state.active) throw new Error('A help response is already in progress');
    const text = bounded(message, 4_000);
    const id = safeId(requestId);
    if (!text || !id) throw new Error('Invalid help question');
    if (!(reuseLastUser && state.messages.at(-1)?.role === 'user' && state.messages.at(-1)?.text === text)) {
      state.messages.push({ id: `user:${id}`.slice(0, 100), role: 'user', text, requestId: id, createdAt: finite(now) });
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }
    state.active = {
      requestId: id,
      runId: '',
      status: 'submitting',
      startedAt: finite(now),
      updatedAt: finite(now),
      pollAfterMs: 3_000,
      nextPollAt: 0,
      attempts: 0,
    };
    state.lastError = null;
    state.notice = null;
    state.updatedAt = finite(now);
    return state;
  }

  function failTurn(stateValue, {
    message,
    status = 0,
    now = Date.now(),
    retryMessage,
    reuseRequestId = false,
  } = {}) {
    const state = normalizeState(stateValue, now);
    const active = state.active;
    const lastUser = [...state.messages].reverse().find((item) => item.role === 'user');
    state.active = null;
    state.lastError = {
      message: bounded(message, 500) || 'The help response could not be completed.',
      requestId: active?.requestId || '',
      retryMessage: bounded(retryMessage, 4_000) || lastUser?.text || '',
      reuseRequestId: reuseRequestId === true,
      status: Math.max(0, Math.floor(finite(status, 0))),
      at: finite(now),
    };
    state.updatedAt = finite(now);
    return state;
  }

  function applyRun(stateValue, payload, now = Date.now()) {
    const state = normalizeState(stateValue, now);
    const raw = payload && typeof payload === 'object' ? payload : {};
    const runId = safeId(raw.run_id ?? raw.runId, state.active?.runId || '');
    const status = bounded(raw.status, 20).toLowerCase();
    if (status === 'queued' || status === 'running') {
      if (!state.active) return state;
      const pollAfterMs = Math.max(1_000, Math.min(30_000, finite(raw.poll_after_ms ?? raw.pollAfterMs, 3_000)));
      state.active = {
        ...state.active,
        runId,
        status,
        updatedAt: finite(now),
        pollAfterMs,
        nextPollAt: finite(now) + pollAfterMs,
        attempts: 0,
      };
      state.updatedAt = finite(now);
      return state;
    }
    if (status === 'completed') {
      const answer = normalizeAnswer(raw.answer);
      if (!runId || !answer.text) return failTurn(state, { message: 'The help service returned an empty response.', now });
      if (!state.messages.some((item) => item.role === 'assistant' && item.runId === runId)) {
        state.messages.push({
          id: `assistant:${runId}`.slice(0, 100),
          role: 'assistant',
          runId,
          createdAt: finite(now),
          feedback: null,
          ...answer,
        });
        state.messages = state.messages.slice(-MAX_MESSAGES);
        state.unread = Math.min(99, state.unread + 1);
      }
      state.active = null;
      state.lastError = null;
      state.notice = null;
      state.updatedAt = finite(now);
      return state;
    }
    if (status === 'cancelled' || status === 'canceled') {
      state.active = null;
      state.lastError = null;
      state.notice = 'Response cancelled.';
      state.updatedAt = finite(now);
      return state;
    }
    if (status === 'failed') {
      return failTurn(state, { message: bounded(raw.error, 500) || 'The help response failed.', now });
    }
    return failTurn(state, { message: 'The help service returned an unknown run state.', now });
  }

  function markRead(stateValue, now = Date.now()) {
    const state = normalizeState(stateValue, now);
    state.unread = 0;
    state.updatedAt = finite(now);
    return state;
  }

  function setFeedback(stateValue, runIdValue, rating, now = Date.now()) {
    const state = normalizeState(stateValue, now);
    const runId = safeId(runIdValue);
    if (!runId || !['helpful', 'not_helpful'].includes(rating)) return state;
    state.messages = state.messages.map((item) => (
      item.role === 'assistant' && item.runId === runId ? { ...item, feedback: rating } : item
    ));
    state.updatedAt = finite(now);
    return state;
  }

  root.GBHelpChatState = Object.freeze({
    STORAGE_KEY,
    VERSION,
    MAX_MESSAGES,
    MAX_HISTORY,
    ACTIVE_STATUSES,
    emptyState,
    normalizeState,
    normalizeContext,
    normalizeAnswer,
    buildRequest,
    beginTurn,
    failTurn,
    applyRun,
    markRead,
    setFeedback,
    makeRequestId,
  });
})(globalThis);
