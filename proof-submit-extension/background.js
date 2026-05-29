/* ───────────────────────────────────────────────────────────────
   background.js — proof-submit-extension service worker.

   Two responsibilities:
     1. Toolbar icon click → tell the active tab to open the image
        viewer (which then leads to the Submit Proof modal).
     2. Handle the `generateProofLink` runtime message the
        SubmitProof React modal sends — scrapes Page128 for the
        ASP.NET hidden fields and POSTs the form server-side,
        mirroring the legacy admin flow.
   No other actions / messages are handled in this build.
─────────────────────────────────────────────────────────────── */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'openImagePreview', opts: {} });
  } catch {
    /* Content scripts only inject on *://*.golfballs.com/*.
       Outside that host the message has nowhere to land — silently
       skip rather than throwing. */
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'generateProofLink') return false;

  const baseUrl =
    'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=128' +
    '&customerID=' + encodeURIComponent(msg.customerId || '');

  fetch(baseUrl, { method: 'GET' })
    .then(async (r) => {
      if (!r.ok) throw new Error('Failed to load Create page');
      const html = await r.text();

      const vsMatch  = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
      const evMatch  = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);
      if (!vsMatch) throw new Error('Could not find __VIEWSTATE');

      const formData = new FormData();
      formData.append('__EVENTTARGET', '');
      formData.append('__EVENTARGUMENT', '');
      formData.append('__VIEWSTATE', vsMatch[1]);
      formData.append('__VIEWSTATEGENERATOR', vsgMatch ? vsgMatch[1] : '');
      formData.append('__EVENTVALIDATION', evMatch ? evMatch[1] : '');
      formData.append('ctl00$inputName',     msg.proofName || `Proof - ${msg.orderId}`);
      formData.append('ctl00$inputKeywords', '');
      formData.append('ctl00$inputNotes',    msg.notes || '');
      formData.append('ctl00$inputLogoType', msg.logoType || 'Ball');
      formData.append('ctl00$inputCustomerID', msg.customerId || '');
      formData.append('ctl00$DropDownSalesRep', msg.salesRepId || '0');
      formData.append('ctl00$DropDownArtist',   msg.artistId   || '42');
      formData.append('ctl00$DropDownStatus',   msg.logoStatus || '1');
      formData.append('ctl00$LogoUpload', new File([''], 'empty.png', { type: 'image/png' }));
      formData.append('ctl00$Button1', 'Create Logo');

      return fetch(baseUrl, { method: 'POST', body: formData, redirect: 'follow' });
    })
    .then(async (r) => {
      const finalUrl = new URL(r.url);
      const messageParam = finalUrl.searchParams.get('message');
      if (messageParam && messageParam.includes('http')) {
        const cleanLink = messageParam.replace('New Job Link ', '').trim();
        sendResponse({ ok: true, proofLink: cleanLink });
      } else {
        const htmlResponse = await r.text();
        const errorMatch = htmlResponse.match(/<span[^>]*style="color:Red[^>]*>([\s\S]*?)<\/span>/i);
        if (errorMatch) {
          console.error('[GB] ASP.NET ERROR:', errorMatch[1].replace(/<[^>]*>?/gm, '').trim());
        }
        throw new Error('Server rejected the form.');
      }
    })
    .catch((err) => {
      console.error('[Background] Proof Generation Error:', err);
      sendResponse({ ok: false, error: err.message });
    });

  return true;
});
