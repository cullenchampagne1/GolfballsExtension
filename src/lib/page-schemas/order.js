/* ───────────────────────────────────────────────────────────────
   page-schemas/order.js — schema for the admin "ViewOrder" page
   (default.aspx?folder=Orders&page=ViewOrder&orderID=…).

   The order SUMMARY (identity / customer / addresses / line items /
   totals) is a rendered confirmation email with almost no element ids,
   so those fields use landmark/structural helper extractors (see
   helpers.js). The right rail + control panels (status, sales rep,
   gift, packing/shipper notes, applied tags, fulfillment) are real
   ASP.NET nodes. Action links are computed from the order's ids via
   orderActionUrl — deterministic URL templates verified across sample
   orders.

   Path shape mirrors the contact schema: `ids.*` for the stable record
   keys, everything else under `order` (order.status, order.customer.*,
   order.totals.*, order.items[…], order.actions.*, …).

   Authored from sample HTML: Orders - ViewOrder{,1,2,3} + the Logo-
   Approval / Order-Assembly sample.
─────────────────────────────────────────────────────────────── */

const action = (name) => ({ type: 'string', extract: { fn: 'orderActionUrl', args: [name] } });

export const orderSchema = {
  id: 'order',
  label: 'Order',
  detect: { url: /[?&]page=ViewOrder/i, dom: '#ctl00_ctl02_cartTable', mode: 'any' },

  fields: {
    ids: {
      type: 'object', label: 'IDs',
      fields: {
        order:       { type: 'string', label: 'Order ID',     extract: { fn: 'orderHeaderField', args: ['order'] }, validate: { required: true, pattern: /^\d+$/, message: 'expected numeric order ID' } },
        orderString: { type: 'string', label: 'Order string',  extract: { fn: 'orderStringField' } },
        customer:    { type: 'string', label: 'Customer ID',   extract: { fn: 'orderHeaderField', args: ['customer'] } },
      },
    },

    order: {
      type: 'object', label: 'Order',
      fields: {
        number:           { type: 'string', label: 'Order number',     extract: { fn: 'orderHeaderField', args: ['order'] } },
        orderString:      { type: 'string', label: 'Order string',     extract: { fn: 'orderStringField' } },
        customerId:       { type: 'string', label: 'Customer ID',      extract: { fn: 'orderHeaderField', args: ['customer'] } },
        status:           { type: 'string', label: 'Order status',     extract: { fn: 'orderStatusText' } },
        orderDate:        { type: 'string', label: 'Order date',       extract: { fn: 'orderDateText' } },
        salesRep:         { type: 'string', label: 'Sales rep',        extract: { sel: '#ctl00_customSalesReps', attr: 'selectedText' } },
        salesRepId:       { type: 'string', label: 'Sales rep ID',     extract: { sel: '#ctl00_customSalesReps', attr: 'value' } },
        requiresApproval: { type: 'string', label: 'Requires approval from', extract: { sel: '#ctl00_ddlRequiresApproval', attr: 'selectedText' } },
        paymentLink:      { type: 'string', label: 'Payment link',     extract: { fn: 'orderPaymentLink' } },
        tags:             { type: 'string', label: 'Applied tags',     extract: { fn: 'orderTags' } },

        /* Customer (the Shipped-To recipient — the most reliable name on
           the order page; the email is the order's contact email). */
        customer: {
          type: 'object', label: 'Customer',
          fields: {
            firstName: { type: 'string', label: 'First name', extract: { fn: 'orderCustomerName', args: ['first'] } },
            lastName:  { type: 'string', label: 'Last name',  extract: { fn: 'orderCustomerName', args: ['last'] } },
            fullName:  { type: 'string', label: 'Full name',  extract: { fn: 'orderCustomerName', args: ['full'] } },
            email:     { type: 'string', label: 'Email',      extract: { sel: 'td.date a[href^="mailto:"]', attr: 'innerText' } },
            phone:     { type: 'string', label: 'Phone',      extract: { fn: 'orderCustomerPhone' } },
          },
        },

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

        /* Credit-card charges (the yellow Order Charges portlet). */
        charges: {
          type: 'object', label: 'Charges',
          fields: {
            total:      { type: 'currency', label: 'Total charged', extract: { fn: 'orderChargeTotal' } },
            hasCharges: { type: 'bool',     label: 'Has charges',   extract: { fn: 'orderHasCharges' } },
          },
        },

        /* Order Assembly / fulfillment. The live status renders in an
           iframe, so we surface the status URL. */
        fulfillment: {
          type: 'object', label: 'Fulfillment',
          fields: {
            statusUrl: { type: 'string', label: 'Assembly status URL', extract: { fn: 'orderFulfillmentUrl' } },
          },
        },

        /* Custom packing + shipper instructions. */
        instructions: {
          type: 'object', label: 'Instructions',
          fields: {
            doNotShipUntil:        { type: 'string', label: 'Do not ship until',  extract: { sel: '#txtDoNotShipUntil', attr: 'value' } },
            pleaseInclude:         { type: 'string', label: 'Please include',     extract: { sel: '#txtPleaseInclude', attr: 'value' } },
            bringPackageTo:        { type: 'string', label: 'Bring package to',   extract: { sel: '#txtBringPackageTo', attr: 'value' } },
            bringPackageFor:       { type: 'string', label: 'Bring package for',  extract: { sel: '#txtBringPackageFor', attr: 'value' } },
            shipperNote:           { type: 'string', label: 'Shipper note',       extract: { sel: '#ProcessingException', attr: 'value' } },
            excludeShippingInvoice:{ type: 'bool',   label: 'Exclude shipping invoice', extract: { sel: '#cbDoNotIncludeShippingInvoice', attr: 'checked' } },
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
            name:       { type: 'string',   extract: { rowFn: 'orderItemField', args: ['name'] } },
            sku:        { type: 'string',   extract: { rowFn: 'orderItemField', args: ['sku'] } },
            qty:        { type: 'number',   extract: { rowFn: 'orderItemField', args: ['qty'] } },
            unitPrice:  { type: 'currency', extract: { rowFn: 'orderItemField', args: ['unitPrice'] } },
            lineTotal:  { type: 'currency', extract: { rowFn: 'orderItemField', args: ['lineTotal'] } },
            url:        { type: 'string',   extract: { rowFn: 'orderItemField', args: ['url'] } },
            itemId:     { type: 'string',   extract: { rowFn: 'orderItemField', args: ['itemId'] } },
            checkPrint: { type: 'string',   extract: { rowFn: 'orderItemField', args: ['checkPrint'] } },
            packerNote: { type: 'string',   extract: { rowFn: 'orderItemField', args: ['packerNote'] } },
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
