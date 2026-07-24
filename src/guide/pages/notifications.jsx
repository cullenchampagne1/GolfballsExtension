import React from 'react';
import { I } from '../../ui/index.js';

function NotificationPreview() {
  const rows = [
    {
      title: 'Your mockups are ready',
      message: 'Venture Towel finished with 4 of 4 images ready.',
      time: '2m',
      tone: 'success',
    },
    {
      title: 'Support ticket updated',
      message: 'GBT-N54EMKJ7 has a new reply.',
      time: '18m',
      tone: 'info',
    },
  ];
  return (
    <div className="reference-demo-panel">
      <div className="reference-demo-head">
        <span><I.alert size={15} /> Notifications</span>
        <b>2 unread</b>
      </div>
      <div className="reference-demo-tabs">
        <span className="on">Unread · 2</span><span>All · 5</span><span>Archived · 1</span>
      </div>
      {rows.map((row) => (
        <div className="reference-demo-row" key={row.title}>
          <span className="reference-demo-avatar">
            {row.tone === 'success' ? <I.check size={13} /> : <I.bolt size={13} />}
          </span>
          <span><b>{row.title}</b><small>{row.message}</small></span>
          <em>{row.time}</em>
        </div>
      ))}
    </div>
  );
}

export function NotificationsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver</div>
      <h1 className="title">Notifications</h1>
      <p className="lede">Keep job completions, support updates, and other important events attached to this extension installation—with an unread badge, offline history, and safe shortcuts back to the relevant tool.</p>

      <div className="docnote info">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Private to this installation</div>
          <p>The extension downloads only notifications addressed to its own registered installation. Other users’ messages are never part of the client response.</p>
        </div>
      </div>

      <h2 className="sec">What you see</h2>
      <div className="reference-split">
        <NotificationPreview />
        <div>
          <p>The popup has a <strong>Notifications</strong> button with the unread count. Chrome’s toolbar icon carries the same badge, capped at 99+. A sender can choose a native Chrome notification, an action card on the active Golfballs page, both surfaces, or the notification center only.</p>
          <p>The center has <strong>Unread / All / Archived</strong> filters and full-message search. Mark an item read to clear its badge, archive it when you are finished, or use its action link to open the relevant supported surface.</p>
        </div>
      </div>

      <h2 className="sec">How an update moves through the system</h2>
      <table className="spectable">
        <thead><tr><th>Stage</th><th>Behavior</th></tr></thead>
        <tbody>
          <tr><td><b>Address</b></td><td>The backend targets one active extension installation, or an administrator intentionally sends to all active installations.</td></tr>
          <tr><td><b>Cache</b></td><td>The worker saves rows before advancing its cursor, so a service-worker suspension cannot create a silent gap.</td></tr>
          <tr><td><b>Notify</b></td><td>An active Golfballs tab receives a temporary action card; otherwise the update still enters the toolbar badge and local center.</td></tr>
          <tr><td><b>Acknowledge</b></td><td>Delivered, read, archived, and acted receipts are idempotent and remain scoped to the current installation.</td></tr>
          <tr><td><b>Recover</b></td><td>The local cache keeps the most recent 200 rows readable when the backend is temporarily unavailable.</td></tr>
        </tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Actions stay constrained</div>
          <p>Notifications cannot run arbitrary code or open arbitrary links. Backend tools select a registered action type and provide validated arguments; the extension reconstructs the matching local handler. Current actions can open a CRM contact, a completed mockup batch, or a support ticket.</p>
        </div>
      </div>

      <div className="reference-links">
        <a href="#workflows/handle-customer-reply"><I.play size={14} /> Handle a notification</a>
        <a href="#manual/reply-notifications"><I.bookmark size={14} /> Detailed reference</a>
      </div>
    </div>
  );
}
