import React from 'react';
import { I } from '../../ui/index.js';

export function CRMWorkspacesPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">Custom CRM Workspaces</h1>
      <p className="lede">Three registered page takeovers replace dense stock CRM detail pages with focused Contact, Account, and Opportunity workspaces. The switches live under Settings → Custom Pages → CRM and can be managed by policy.</p>

      <table className="spectable">
        <thead><tr><th>Workspace</th><th>What it brings together</th><th>Important actions</th></tr></thead>
        <tbody>
          <tr><td><b>Contact Details</b></td><td>Identity and account facts, revenue/order history, logo proofs, tasks, opportunities, activity, email history, and account contacts.</td><td>Compose email with account templates and slash commands; read relayed email/chat activity; add local context notes.</td></tr>
          <tr><td><b>Account Details</b></td><td>Account profile, linked contacts, activity and roll-up information in a dashboard-style view.</td><td>Open related records and work from the account context without returning to the stock detail layout.</td></tr>
          <tr><td><b>Opportunity Details</b></td><td>Opportunity facts, tasks, email thread, proposal selection, line-item breakdown, margin, and customer-facing email.</td><td>Select a proposal, inspect its economics, load it into the proposal workflow, or prepare the email.</td></tr>
        </tbody>
      </table>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b"><div className="dn-t">One known placeholder</div><p>The Contact composer’s “insert saved proposal” slash command is visibly marked as not implemented. Use the Gift Catalog / Proposal Email flow to insert and send a real proposal; do not treat that command as operational.</p></div>
      </div>

      <h2 className="sec">Data ownership</h2>
      <ul>
        <li><strong>CRM-backed data</strong>—contact, account, opportunity, task, order, activity, proof, and proposal records—comes from the live page schema and CRM endpoints.</li>
        <li><strong>Extension-local state</strong>—for example local context notes and cached/indexed search data—stays in the browser unless a documented flow writes it back.</li>
        <li>Turning a takeover off restores the stock CRM page; it does not delete either CRM data or local extension data.</li>
      </ul>

      <h2 className="sec">Contextual search routines</h2>
      <p>While CRM Search is open, the Actions Shelf can expose <strong>Run last query</strong> and <strong>Scan for recent orders</strong>. The scan automatically targets contacts assigned to your signed-in CRM employee ID; the first run covers the previous seven days, then later runs continue from the stored watermark. Task List similarly adds <strong>Only overdue + due today</strong> while that modal is open.</p>

      <div className="reference-links">
        <a href="#workflows/use-custom-crm-workspace"><I.play size={14} /> Use a CRM workspace</a>
        <a href="#workflows/scan-recent-orders"><I.play size={14} /> Scan recent orders</a>
        <a href="#manual/custom-crm-pages"><I.bookmark size={14} /> Workspace reference</a>
      </div>
    </div>
  );
}
