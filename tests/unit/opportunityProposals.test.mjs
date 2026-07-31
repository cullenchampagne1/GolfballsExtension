import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractOpportunityProposals,
  proposalTextStyle,
} from '../../src/lib/opportunityProposals.js';

describe('opportunity proposals', () => {
  it('preserves the CRM line-through marker as deleted proposal state', () => {
    const dom = new JSDOM(`
      <table><tbody>
        <tr>
          <td style="text-decoration:line-through;" id="a2f71f95-a6e0-44db-8d9c-a5ae08c7d672row">
            <input onchange="javascript:ProposalCheckToggle(this, 'a2f71f95-a6e0-44db-8d9c-a5ae08c7d672', 'ProV1x', '9/5/2026', 'True');">
          </td>
        </tr>
        <tr>
          <td id="e4457ebf-3db4-4424-beba-f13949f0cb0drow">
            <input onchange="javascript:ProposalCheckToggle(this, 'e4457ebf-3db4-4424-beba-f13949f0cb0d', '6dz', '9/14/2026', 'True');">
          </td>
        </tr>
      </tbody></table>
    `);

    assert.deepEqual(extractOpportunityProposals(dom.window.document), [
      {
        cartId: 'a2f71f95-a6e0-44db-8d9c-a5ae08c7d672',
        name: 'ProV1x',
        expiration: '9/5/2026',
        newSite: true,
        deleted: true,
      },
      {
        cartId: 'e4457ebf-3db4-4424-beba-f13949f0cb0d',
        name: '6dz',
        expiration: '9/14/2026',
        newSite: true,
        deleted: false,
      },
    ]);
  });

  it('only applies strike-through presentation to deleted proposals', () => {
    assert.deepEqual(proposalTextStyle({ deleted: true }), {
      textDecoration: 'line-through',
      textDecorationThickness: '1px',
    });
    assert.equal(proposalTextStyle({ deleted: false }), null);
  });
});
