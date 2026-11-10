// Checkout can otherwise submit while Admin Order Details still has unsaved edits.
(() => {
  if (window.__gbCheckoutInstructionsGuard) return;
  window.__gbCheckoutInstructionsGuard = true;

  const ownedButtons = new Set();
  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const isPlaceOrder = (button) => normalize(button.textContent || button.value) === 'Place Order';

  function isVisible(element) {
    for (let node = element; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (node.hidden || style.display === 'none' || style.visibility === 'hidden'
        || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  }

  function hasUnsavedInstructions() {
    if (!/^\/checkout\/?$/i.test(window.location.pathname)) return false;
    return [...document.querySelectorAll('.panel-heading')].some((heading) => (
      /Admin Order Details/i.test(normalize(heading.textContent))
      && [...heading.querySelectorAll('*')].some((node) => (
        /^Caution: Your changes are NOT saved!$/i.test(normalize(node.textContent))
        && isVisible(node)
      ))
    ));
  }

  function sync() {
    const blocked = hasUnsavedInstructions();
    for (const button of ownedButtons) {
      if (!blocked || !button.isConnected || !isPlaceOrder(button)) {
        button.disabled = false;
        ownedButtons.delete(button);
      }
    }
    if (!blocked) return;
    for (const button of document.querySelectorAll('button, input[type="submit"]')) {
      if (!isPlaceOrder(button)) continue;
      // Leave controls already disabled by checkout under the site's ownership.
      if (!button.disabled) {
        ownedButtons.add(button);
        button.disabled = true;
      }
    }
  }

  // Capture before checkout's React handlers, including the gap before observer delivery.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button, input[type="submit"]');
    if (!button || !isPlaceOrder(button) || !hasUnsavedInstructions()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sync();
  }, true);

  const observer = new MutationObserver(sync);
  const observerOptions = {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled'],
  };
  observer.observe(document.documentElement, observerOptions);
  window.addEventListener('popstate', sync);
  window.addEventListener('pagehide', () => observer.disconnect());
  window.addEventListener('pageshow', () => {
    observer.observe(document.documentElement, observerOptions);
    sync();
  });
  sync();
})();
