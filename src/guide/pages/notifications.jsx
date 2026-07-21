import React from 'react';
import { I } from '../../ui/index.js';

function NotificationPreview() {
  const rows = [
    { name: 'Jordan Lee', subject: 'Re: Q3 golf outing', preview: 'The navy option looks great. Can we…', time: '2m', count: 2 },
    { name: 'Avery Martin', subject: 'Logo approval', preview: 'Approved—please move forward.', time: '18m' },
  ];
  return (
    <div className="reference-demo-panel">
      <div className="reference-demo-head"><span><I.alert size={15} /> Notifications</span><b>2 open</b></div>
      <div className="reference-demo-tabs"><span className="on">Open · 2</span><span>All · 5</span><span>Done · 3</span></div>
      {rows.map((row) => (
        <div className="reference-demo-row" key={row.name}>
          <span className="reference-demo-avatar"><I.mail size={13} /></span>
          <span><b>{row.name}{row.count ? ` · ${row.count}` : ''}</b><small>{row.subject}</small><small>{row.preview}</small></span>
          <em>{row.time}</em>
        </div>
      ))}
    </div>
  );
}

export function NotificationsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver · Admin build</div>
      <h1 className="title">Customer Reply Notifications</h1>
      <p className="lede">The email relay watches for new inbound customer replies, stores a compact local inbox, updates the extension badge, and links each reply back to the customer when a CRM match is available.</p>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Availability</div>
          <p>This is an admin-build capability. Both <strong>Notifications</strong> under Settings → Features and <strong>Email Relay: customer reply notifications</strong> under Developer Settings must be enabled. The relay endpoints must also be deployed and the extension installation enrolled with RevStack.</p>
        </div>
      </div>

      <h2 className="sec">What you see</h2>
      <div className="reference-split">
        <NotificationPreview />
        <div>
          <p>The popup gains a <strong>Notifications</strong> button with the open-reply count. Chrome’s toolbar icon carries the same badge (capped at 99+). New replies also raise a toast on open golfballs.com tabs.</p>
          <p>The modal has <strong>Open / All / Done</strong> filters and search by contact name, email, or subject. Hover a row to open the customer account, view the relayed email, or mark it done/reopen it. Completed rows can be cleared in bulk.</p>
        </div>
      </div>

      <h2 className="sec">How a reply moves through the system</h2>
      <table className="spectable">
        <thead><tr><th>Stage</th><th>Behavior</th></tr></thead>
        <tbody>
          <tr><td><b>Enable</b></td><td>The first poll primes the cursor to the latest relay message so old mail is not announced as new.</td></tr>
          <tr><td><b>Listen</b></td><td>A 25-second long poll provides near-real-time delivery; a one-minute alarm is the recovery/safety cadence.</td></tr>
          <tr><td><b>Resolve</b></td><td>The sender email is matched against the encrypted local CRM index first, then Solr as a best-effort fallback.</td></tr>
          <tr><td><b>Store</b></td><td>Replies are kept locally under <code>gbNotifications</code>, newest first, capped at 200. Replies from the same sender and subject fold into one thread row.</td></tr>
          <tr><td><b>Close the loop</b></td><td>Sending a Power Automate reply to that email automatically marks its open notifications done; manual Done/Reopen remains available.</td></tr>
        </tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">If replies do not appear</div>
          <p>Confirm both switches are on, the backend relay is reachable, and the installation is enrolled. An unresolved CRM contact does <em>not</em> discard a notification—it only removes the account shortcut. If no golfballs.com tab is open, the reply still enters the stored list and badge; only the transient toast is skipped.</p>
        </div>
      </div>

      <div className="reference-links">
        <a href="#workflows/handle-customer-reply"><I.play size={14} /> Handle a customer reply</a>
        <a href="#manual/reply-notifications"><I.bookmark size={14} /> Detailed reference</a>
      </div>
    </div>
  );
}
