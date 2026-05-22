if (window.__gbLoaded_notifications) {} else { window.__gbLoaded_notifications = true;
// notifications.js

function __gbInjectNotifStyles() {
  if (document.getElementById('__gb-notif-css')) return;
  const s = document.createElement('style');
  s.id = '__gb-notif-css';
  s.textContent = `
    @keyframes __gbNIn  { from{opacity:0;transform:translateY(-10px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
    @keyframes __gbNOut { to{opacity:0;transform:translateY(-8px) scale(.97);max-height:0;margin:0;padding:0;overflow:hidden} }
    @keyframes __gbSpin { to{transform:rotate(360deg)} }
    @keyframes __gbModalFadeOut   { to{opacity:0;backdrop-filter:blur(0)} }
    @keyframes __gbModalSlideDown { to{opacity:0;transform:scale(.94) translateY(16px)} }

    #__gb-notif-container {
      position:fixed !important; top:18px !important;
      left:50% !important; transform:translateX(-50%) !important;
      z-index:2147483647 !important;
      display:flex !important; flex-direction:column !important;
      align-items:stretch !important; gap:8px !important;
      pointer-events:none !important;
      width:360px !important; max-width:94vw !important;
    }

    .gb-toast {
      pointer-events:auto !important;
      display:flex !important; align-items:center !important; gap:0 !important;
      width:100% !important;
      border-radius:12px !important;
      overflow:hidden !important;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
      
      /* Dark Frosted Glass */
      background:rgba(17,17,17,.85) !important;
      backdrop-filter:blur(16px) !important; -webkit-backdrop-filter:blur(16px) !important;
      border:1px solid rgba(255,255,255,.08) !important;
      box-shadow:0 12px 40px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.03) !important;
      
      animation:__gbNIn .25s cubic-bezier(.34,1.4,.64,1) forwards !important;
    }

    /* Left accent stripe */
    .gb-toast-stripe {
      width:3px !important; align-self:stretch !important; flex-shrink:0 !important;
    }

    /* Icon */
    .gb-toast-icon-col {
      width:46px !important; flex-shrink:0 !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
    }
    .gb-toast-icon-wrap {
      width:26px !important; height:26px !important; border-radius:7px !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      border: 1px solid currentColor !important;
    }
    .gb-toast-icon-wrap svg {
      width:13px !important; height:13px !important; display:block !important; flex-shrink:0 !important;
    }

    /* Text */
    .gb-toast-text-col {
      flex:1 !important; min-width:0 !important;
      padding:12px 0 12px 0 !important;
      display:flex !important; flex-direction:column !important; justify-content:center !important;
    }
    .gb-toast-label {
      font-size:9.5px !important; font-weight:800 !important;
      text-transform:uppercase !important; letter-spacing:.7px !important;
      margin-bottom:3px !important; line-height:1 !important;
    }
    .gb-toast-msg {
      font-size:12.5px !important; font-weight:500 !important;
      color:rgba(255,255,255,.85) !important; line-height:1.4 !important;
    }

    /* Close */
    .gb-toast-close {
      flex-shrink:0 !important; margin:0 10px 0 8px !important;
      background:rgba(255,255,255,.05) !important;
      border:1px solid rgba(255,255,255,.1) !important;
      border-radius:6px !important; color:rgba(255,255,255,.6) !important;
      cursor:pointer !important; width:22px !important; height:22px !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      padding:0 !important; transition:all .15s !important;
    }
    .gb-toast-close:hover { background:rgba(255,255,255,.12) !important; color:#fff !important; }
    .gb-toast-close svg { width:9px !important; height:9px !important; display:block !important; }

    /* Progress bar */
    .gb-toast-bar-row {
      position:absolute !important; bottom:0 !important; left:0 !important; right:0 !important;
      height:2px !important;
    }
    .gb-toast-bar-track {
      height:100% !important; background:transparent !important; width:100% !important;
    }
    .gb-toast-bar {
      height:100% !important; width:100% !important;
    }

    .gb-toast { position:relative !important; }
  `;
  document.head.appendChild(s);
}
__gbInjectNotifStyles();

// Fully dynamic palette tied to your extension's CSS variables
const _NT = {
  info: {
    stripe: 'rgba(var(--gb-brand-label-rgb, 125,184,42), .5)',
    iconBg: 'rgba(var(--gb-brand-label-rgb, 125,184,42), .15)',
    iconColor: 'var(--gb-brand-label, #7db82a)',
    label: 'var(--gb-brand-label, #7db82a)',
    bar: 'var(--gb-brand-label, #7db82a)',
    icon: '<circle cx="6.5" cy="6.5" r="5"/><line x1="6.5" y1="6" x2="6.5" y2="9.5" stroke-width="1.6"/><circle cx="6.5" cy="4.5" r=".55" fill="currentColor" stroke="none"/>'
  },
  success: {
    stripe: 'rgba(var(--gb-success-rgb, 56,176,0), .5)',
    iconBg: 'rgba(var(--gb-success-rgb, 56,176,0), .15)',
    iconColor: 'var(--gb-success, #38b000)',
    label: 'var(--gb-success, #38b000)',
    bar: 'var(--gb-success, #38b000)',
    icon: '<circle cx="6.5" cy="6.5" r="5"/><polyline points="4.5,6.8 6,8.5 8.5,4.5" stroke-width="1.6" stroke-linejoin="round"/>'
  },
  error: {
    stripe: 'rgba(var(--gb-error-rgb, 200,96,96), .5)',
    iconBg: 'rgba(var(--gb-error-rgb, 200,96,96), .15)',
    iconColor: 'var(--gb-error, #c86060)',
    label: 'var(--gb-error, #c86060)',
    bar: 'var(--gb-error, #c86060)',
    icon: '<circle cx="6.5" cy="6.5" r="5"/><line x1="5" y1="5" x2="8" y2="8" stroke-width="1.6"/><line x1="8" y1="5" x2="5" y2="8" stroke-width="1.6"/>'
  },
  loading: {
    stripe: 'rgba(var(--gb-brand-label-rgb, 125,184,42), .5)',
    iconBg: 'rgba(var(--gb-brand-label-rgb, 125,184,42), .15)',
    iconColor: 'var(--gb-brand-label, #7db82a)',
    label: 'var(--gb-brand-label, #7db82a)',
    bar: 'var(--gb-brand-label, #7db82a)',
    icon: '<circle cx="6.5" cy="6.5" r="4.5" stroke-opacity=".18" stroke-width="1.6"/><path d="M6.5 2A4.5 4.5 0 0 1 11 6.5" stroke-width="1.6" stroke-linecap="round"/>'
  }
};

const _NL = { info: 'Notice', success: 'Success', error: 'Error', loading: 'Working' };
const _X  = '<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="6.5" y2="6.5"/><line x1="6.5" y1="1.5" x2="1.5" y2="6.5"/></svg>';

function __gbDismissToast(t) {
  if (!t.isConnected || t.__d) return;
  t.__d = true;
  t.style.setProperty('animation', '__gbNOut .18s cubic-bezier(.4,0,1,1) forwards', 'important');
  t.style.setProperty('pointer-events', 'none', 'important');
  setTimeout(() => t.isConnected && t.remove(), 200);
}

/**
 * Shows a themed toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'loading'} [type='info']
 * @param {number} [duration=3000]  <=0 = persistent until dismissed
 */
function showGbNotification(message, type = 'info', duration = 3000) {
  let c = document.getElementById('__gb-notif-container');
  if (!c) { c = document.createElement('div'); c.id = '__gb-notif-container'; document.body.appendChild(c); }

  const th      = _NT[type] || _NT.info;
  const persist = type === 'loading' || duration <= 0;
  const spin    = type === 'loading'
    ? ' style="display:block;animation:__gbSpin .7s linear infinite!important"'
    : '';

  const t = document.createElement('div');
  t.className = 'gb-toast';

  t.innerHTML = `
    <div class="gb-toast-stripe" style="background:${th.stripe}!important;"></div>
    <div class="gb-toast-icon-col">
      <div class="gb-toast-icon-wrap" style="background:${th.iconBg}!important;color:${th.iconColor}!important;border-color:rgba(255,255,255,.1)!important;">
        <span${spin}><svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${th.icon}</svg></span>
      </div>
    </div>
    <div class="gb-toast-text-col">
      <div class="gb-toast-label" style="color:${th.label}!important;">${_NL[type] || 'Notice'}</div>
      <div class="gb-toast-msg">${message}</div>
    </div>
    <button class="gb-toast-close" title="Dismiss">${_X}</button>
    <div class="gb-toast-bar-row">
      <div class="gb-toast-bar-track">
        <div class="gb-toast-bar" style="background:${th.bar}!important;box-shadow:0 0 8px ${th.bar}!important;"></div>
      </div>
    </div>`;

  c.appendChild(t);
  t.querySelector('.gb-toast-close').addEventListener('click', () => __gbDismissToast(t));

  const bar = t.querySelector('.gb-toast-bar');

  if (persist) {
    bar.style.setProperty('width', '0', 'important');
    return {
      update(msg, nt) {
        if (msg) t.querySelector('.gb-toast-msg').textContent = msg;
        if (nt && nt !== type) {
          const nth = _NT[nt] || th;
          t.querySelector('.gb-toast-stripe').style.setProperty('background', nth.stripe, 'important');
          const iw = t.querySelector('.gb-toast-icon-wrap');
          iw.style.setProperty('background', nth.iconBg, 'important');
          iw.style.setProperty('color', nth.iconColor, 'important');
          const sp = iw.querySelector('span');
          sp.style.animation = '';
          sp.querySelector('svg').innerHTML = nth.icon;
          t.querySelector('.gb-toast-label').style.setProperty('color', nth.label, 'important');
          t.querySelector('.gb-toast-label').textContent = _NL[nt] || 'Notice';
          bar.style.setProperty('background', nth.bar, 'important');
          bar.style.setProperty('box-shadow', `0 0 8px ${nth.bar}`, 'important');
          type = nt;
        }
      },
      setProgress(pct) {
        // pct: 0–100
        bar.style.setProperty('width', Math.min(100, Math.max(0, pct)) + '%', 'important');
        bar.style.setProperty('transition', 'width .4s ease', 'important');
      },
      dismiss(delay = 0) { setTimeout(() => __gbDismissToast(t), delay); }
    };
  }

  // Countdown bar
  requestAnimationFrame(() => {
    bar.style.setProperty('transition', `width ${duration}ms linear`, 'important');
    requestAnimationFrame(() => bar.style.setProperty('width', '0', 'important'));
  });
  setTimeout(() => __gbDismissToast(t), duration);
}

function __gbCloseModal(overlay, ms = 220) {
  if (!overlay || !overlay.isConnected) return;
  overlay.style.setProperty('animation', `__gbModalFadeOut ${ms}ms ease forwards`, 'important');
  const card = overlay.firstElementChild;
  if (card) card.style.setProperty('animation', `__gbModalSlideDown ${ms}ms cubic-bezier(.4,0,1,1) forwards`, 'important');
  setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, ms + 20);
}

}