/* ───────────────────────────────────────────────────────────────
   page-schemas/order.js — schema for the admin "ViewOrder" page
   (default.aspx?folder=Orders&page=ViewOrder&orderID=…).

   The order SUMMARY (identity / addresses / line items / totals) is a
   rendered confirmation email with almost no element ids, so those
   fields use landmark/structural helper extractors (see helpers.js:
   orderHeaderField, totalsRow, addressBlock, orderLineItemRows, …). The
   right-rail controls (sales rep, status dropdown, gift) are real ASP.NET
   nodes with ids. Action links are computed from the order's ids via
   orderActionUrl — deterministic URL templates verified across 4 sample
   orders (Shipped / Out-Of-Stock / Charge-Error / Fraud-Screening).

   Path shape mirrors the contact schema: `ids.*` for the stable record
   keys, and everything else under a single `order` object so templates
   and match rules read `order.status`, `order.totals.total`,
   `order.items[0].name`, `order.actions.tracking`, etc.

   Authored from sample HTML: Orders - ViewOrder{,1,2,3}.html
─────────────────────────────────────────────────────────────── */

const action = (name) => ({ type: 'string', extract: { fn: 'orderActionUrl', args: [name] } });

export const orderSchema = {
  id: 'order',
  label: 'Order',
  /* page=ViewOrder in the URL, OR the line-items table id as a DOM
     confirmer (covers fetched docs whose URL got normalised away). */
  detect: { url: /[?&]page=ViewOrder/i, dom: '#ctl00_ctl02_cartTable', mode: 'any' },

  fields: {
    /* Stable record keys — kept top-level like the contact schema's ids. */
    ids: {
      type: 'object', label: 'IDs',
      fields: {
        order:       { type: 'string', label: 'Order ID',     extract: { fn: 'orderHeaderField', args: ['order'] }, validate: { required: true, pattern: /^\d+$/, message: 'expected numeric order ID' } },
        orderString: { type: 'string', label: 'Order string',  extract: { fn: 'orderHeaderField', args: ['orderString'] } },
        customer:    { type: 'string', label: 'Customer ID',   extract: { fn: 'orderHeaderField', args: ['customer'] } },
      },
    },

    order: {
      type: 'object', label: 'Order',
      fields: {
        number:        { type: 'string',  label: 'Order number',   extract: { fn: 'orderHeaderField', args: ['order'] } },
        orderString:   { type: 'string',  label: 'Order string',   extract: { fn: 'orderStringField' } },
        customerId:    { type: 'string',  label: 'Customer ID',    extract: { fn: 'orderHeaderField', args: ['customer'] } },
        status:        { type: 'string',  label: 'Order status',   extract: { fn: 'orderStatusText' } },
        orderDate:     { type: 'string',  label: 'Order date',     extract: { fn: 'orderDateText' } },
        customerEmail: { type: 'string',  label: 'Customer email', extract: { sel: 'td.date a[href^="mailto:"]', attr: 'innerText' } },
        paymentLink:   { type: 'string',  label: 'Payment link',   extract: { fn: 'orderPaymentLink' } },
        salesRep:      { type: 'string',  label: 'Sales rep',      extract: { sel: '#ctl00_customSalesReps', attr: 'selectedText' } },
        requiresApproval: { type: 'string', label: 'Requires approval', extract: { sel: '#ctl00_ddlRequiresApproval', attr: 'selectedText' } },

        addresses: {
          type: 'object', label: 'Addresses',
          fields: {
            shipTo:         { type: 'string', label: 'Ship to',         extract: { fn: 'addressBlock', args: ['Shipped To:'] } },
            billedTo:       { type: 'string', label: 'Billed to',       extract: { fn: 'addressBlock', args: ['Billed To:'] } },
            billingAddress: { type: 'string', label: 'Billing address', extract: { fn: 'addressBlock', args: ['Billing Address:'] } },
          },
        },

        totals: {
          type: 'object', label: 'Totals',
          fields: {
            total:    { type: 'currency', label: 'Order total', extract: { sel: '#orderTotal', attr: 'innerText' } },
            subTotal: { type: 'currency', label: 'Sub total',   extract: { fn: 'totalsRow', args: ['^Sub ?Total'] } },
            shipping: { type: 'currency', label: 'Shipping',    extract: { fn: 'totalsRow', args: ['Shipping$'] } },
            tax:      { type: 'currency', label: 'Sales tax',   extract: { fn: 'totalsRow', args: ['Sales Tax'] } },
            discount: { type: 'currency', label: 'Discount',    extract: { fn: 'totalsRow', args: ['^Promotion'] } },
          },
        },

        gift: {
          type: 'object', label: 'Gift',
          fields: {
            message:   { type: 'string', label: 'Gift message',   extract: { sel: '#ctl00_GiftMessage', attr: 'value' } },
            signature: { type: 'string', label: 'Gift signature', extract: { sel: '#ctl00_GiftSignature', attr: 'value' } },
          },
        },

        items: {
          type: 'array', label: 'Line items',
          extract: { fn: 'orderLineItemRows' },
          itemFields: {
            name:      { type: 'string',   extract: { rowFn: 'orderItemField', args: ['name'] } },
            sku:       { type: 'string',   extract: { rowFn: 'orderItemField', args: ['sku'] } },
            qty:       { type: 'number',   extract: { rowFn: 'orderItemField', args: ['qty'] } },
            unitPrice: { type: 'currency', extract: { rowFn: 'orderItemField', args: ['unitPrice'] } },
            lineTotal: { type: 'currency', extract: { rowFn: 'orderItemField', args: ['lineTotal'] } },
            url:       { type: 'string',   extract: { rowFn: 'orderItemField', args: ['url'] } },
            itemId:    { type: 'string',   extract: { rowFn: 'orderItemField', args: ['itemId'] } },
          },
        },

        /* Action links — computed from the order's ids (orderActionUrl). */
        actions: {
          type: 'object', label: 'Action links',
          fields: {
            tracking:            action('tracking'),
            printInvoice:        action('printInvoice'),
            emailCustomer:       action('emailCustomer'),
            addTracking:         action('addTracking'),
            createInvoice:       action('createInvoice'),
            updateShipping:      action('updateShipping'),
            addressValidation:   action('addressValidation'),
            editShippingAddress: action('editShippingAddress'),
            dropShip:            action('dropShip'),
            returnDoc:           action('returnDoc'),
            reorder:             action('reorder'),
            econnectLog:         action('econnectLog'),
            itemPriority:        action('itemPriority'),
            contactPage:         action('contactPage'),
          },
        },
      },
    },
  },
};
