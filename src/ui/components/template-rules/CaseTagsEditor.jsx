import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { Card } from '../Card.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { I } from '../../icons.jsx';

/* Matches the row animation language used by OrderRules / CaseRules /
   AccountRules so adding/removing a tag feels like the rest of the
   editor. */
const ROW_TRANSITION = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };
const ROW_INITIAL    = { opacity: 0, y: -6, scale: 0.97 };
const ROW_ANIMATE    = { opacity: 1, y: 0,  scale: 1 };
const ROW_EXIT       = { opacity: 0, scale: 0.94, transition: { duration: 0.14 } };

/* ─────────────────────────────────────────────────────────────
   CaseTagsEditor — recommended case-identifier picker for case
   templates. Mirrors backup/editor.js CASE_CATS_EDITOR verbatim
   so saved `tpl.caseTags` ({category, subcategory}[]) round-trip.

   The case-email modal reads `tpl.caseTags` to suggest tags when
   the case is processed; without an editor users can't curate the
   list any more (the field survives template save via {...tpl}
   spread but is otherwise frozen).
───────────────────────────────────────────────────────────── */

const CASE_CATS = {
  'Order Status Update':              ['Lost Package','Carrier Issue','Tracking Update','Out of Stock','Drop Ships','Late Ship','Misunderstanding'],
  'Place an Order':                   [],
  'Product Inquiry':                  ['Sale Made - Yes','Sale Made - No'],
  'Transfer':                         ['Custom Logo','Retail','Human Resources','Direct Transfer'],
  'Returns/Reprint':                  ['Wrong Item Ordered (Customer Error)','Wrong Item Shipped (GBC Error)','Shipped qty error (GBC error)','Drop Ship Error (Man. Error)','Drop Ship Error (GBC Error)','Manufacture Error/Defect','Lost in Transit (Courier Error)','Printing Defects - GBC PRODUCTION (BOH Error)','Printing Defects - GBC CSR Error','Printing Defects - Customer Error','Incorrect Product Customized','Production Defects','Quality of Print','Damaged Package Courier Error'],
  'Charge Error':                     ['Fixed - System did not charge','Fixed - System failed to attach charge','Actual Charge Error - Resolved by Customer','Actual Charge Error - Resolved by CSR','Fraud','Card did not populate'],
  'Fraud Inquiry':                    [],
  'International Orders':             [],
  'Profanity':                        [],
  'Order Change':                     ['Quantity','Personalization Edit','Shipping Address','Billing Address Change','Shipping Method Change','Product Change','Payment Method','System Error'],
  'Cancelation':                      ['Out of Stock','Customer Changed Mind','Delivery Delays','Expected Delivery Date Changed','Alternative available found better price','Alternative available found better quality','Subscribe and Score'],
  'Website Concerns':                 ['User Experience','Cannot Load cart','Cannot Login','Cannot Check out','Subscribe and Score','Cannot Cancel Order','Site Navigation','Promo Codes','Price Variance','Shipping Address would not populate','PO Box'],
  'General Inquiry':                  ['Shipping options available','General website guidance / use'],
  'CSAT':                             ['CSAT Note','Detractor'],
  'Other - Details must be provided': [],
};

const CAT_OPTIONS = Object.keys(CASE_CATS).map((c) => ({ id: c, label: c }));
const subOptions  = (cat) => {
  const subs = CASE_CATS[cat] || [];
  if (!subs.length) return [{ id: '', label: '— none —', disabled: true }];
  return subs.map((s) => ({ id: s, label: s }));
};

const emptyStyle = {
  padding: '13px 12px', textAlign: 'center', fontSize: 11,
  color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)',
  border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
};

let _uid = 0;

/**
 * CaseTagsEditor — props: `initial` (saved tpl.caseTags),
 * `onChange` (emits the array of {category, subcategory} on edit).
 */
export function CaseTagsEditor({ initial, onChange }) {
  const [tags, setTags] = useState(() =>
    (Array.isArray(initial) ? initial : []).map((t) => ({
      _id: ++_uid,
      category:    t.category    || Object.keys(CASE_CATS)[0],
      subcategory: t.subcategory || '',
    })),
  );

  const commit = (next) => {
    setTags(next);
    onChange?.(next.map(({ _id, ...rest }) => rest));
  };
  const add = () => {
    const firstCat = Object.keys(CASE_CATS)[0];
    commit([...tags, {
      _id: ++_uid,
      category: firstCat,
      subcategory: (CASE_CATS[firstCat] || [])[0] || '',
    }]);
  };
  const del = (id) => commit(tags.filter((t) => t._id !== id));
  // Changing category resets subcategory to the new list's first entry
  // (matches backup behavior — prevents stale combos like Cancelation +
  // "Lost Package").
  const changeCat = (id, category) => {
    const subs = CASE_CATS[category] || [];
    commit(tags.map((t) => (t._id === id
      ? { ...t, category, subcategory: subs[0] || '' }
      : t)));
  };
  const changeSub = (id, subcategory) => {
    commit(tags.map((t) => (t._id === id ? { ...t, subcategory } : t)));
  };

  return (
    <div>
      <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />} onClick={add}>Add tag</Btn>}>
        Recommended case tags
      </SectionLabel>

      {tags.length === 0 ? (
        <div style={emptyStyle}>
          No tags — add one to suggest case identifiers when this template runs.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {tags.map((t) => (
              <motion.div
                key={t._id}
                layout
                initial={ROW_INITIAL}
                animate={ROW_ANIMATE}
                exit={ROW_EXIT}
                transition={ROW_TRANSITION}
              >
                <Card padding={8}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 26px', gap: 6, alignItems: 'center' }}>
                    <Dropdown
                      size="sm" searchable
                      value={t.category}
                      options={CAT_OPTIONS}
                      onChange={(v) => changeCat(t._id, v)}
                    />
                    <Dropdown
                      size="sm"
                      value={t.subcategory}
                      placeholder={(CASE_CATS[t.category] || []).length ? 'Select…' : '— none —'}
                      options={subOptions(t.category)}
                      onChange={(v) => changeSub(t._id, v)}
                    />
                    <IconBtn size="sm" icon={<I.trash />} danger onClick={() => del(t._id)} />
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
