// defaults.js — Factory default storage state seeded on first install.
// Generated from exported extension state. Do not edit by hand.
// Keys excluded: orderTabId, editorTabId, chargeContext, pickMode, pickResult,
//                watchList, userPresets (user-managed, not factory defaults).

const GB_FACTORY_DEFAULTS = {
  "featureFlags": {
    "autoPushEnabled": true,
    "calendarEnabled": true,
    "chargeEnabled": true,
    "copyIdsEnabled": true,
    "developerMode": false,
    "emailPreviewEnabled": true,
    "gbEmployeeId": "",
    "imagePreviewEnabled": true,
    "orderEditEnabled": true,
    "signifydGlowEnabled": true,
    "watchListEnabled": true
  },
  "themeColors": {
    "--gb-brand": "#64748b",
    "--gb-brand-accent": "#cbd5e1",
    "--gb-brand-border": "#334155",
    "--gb-brand-dark": "#4f5f74",
    "--gb-brand-label": "#94a3b8",
    "--gb-brand-surface": "#0f1520",
    "--gb-brand-text": "#e2e8f0",
    "--gb-page-btn": "#37474f",
    "--gb-page-btn-border": "#1c2b31",
    "--gb-page-btn-dark": "#263238",
    "--gb-page-btn-saved": "#263238",
    "--gb-page-btn-text": "#eceff1"
  },
  "noteTemplates": [
    {
      "audienceVal": "Custom Logo",
      "body": "Proof Requested {{date}}",
      "daysOut": 2,
      "enabled": false,
      "id": "mnz4fnqtz5obq",
      "name": "Proof Requested",
      "subject": "Art Update",
      "updatedAt": 1777498339867,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Approval Requested {{date}}",
      "daysOut": 1,
      "enabled": false,
      "id": "mo1knwspxx6zj",
      "name": "Approval Requested",
      "subject": "Art Update",
      "updatedAt": 1777640664014,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Small Text {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo1kosx753x8r",
      "name": "Small Text",
      "subject": "Art Update",
      "updatedAt": 1776455596706,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Requested Art File {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo1kpqf3p0w4j",
      "name": "Requested Art File",
      "subject": "Art Update",
      "updatedAt": 1777498332277,
      "subType": "note"
    },
    {
      "audienceVal": "Customer Service",
      "body": "Requested Payment {{date}}",
      "daysOut": null,
      "enabled": true,
      "id": "mo1sw5ruqdx7a",
      "name": "Charge Error",
      "subject": "Charge Error",
      "updatedAt": 1776455601440,
      "subType": "note"
    },
    {
      "audienceVal": "Customer Service",
      "body": "Recommended Replacement {{date}}",
      "daysOut": null,
      "enabled": true,
      "id": "mo1sxafnenw0m",
      "name": "Out of Stock",
      "subject": "Out of Stock",
      "updatedAt": 1776455603600,
      "subType": "note"
    },
    {
      "audienceVal": "Customer Service",
      "body": "Asked for Replacement Personalization {{date}}",
      "daysOut": null,
      "enabled": true,
      "id": "mo1ukqps8123t",
      "name": "Inappropriate",
      "subject": "Inappropriate Personalization",
      "updatedAt": 1776455605623,
      "subType": "note"
    },
    {
      "audienceVal": "Customer Service",
      "body": "Asked for Replacement Personalization {{date}}",
      "daysOut": null,
      "enabled": true,
      "id": "mo2ywm0awog81",
      "name": "Copyright",
      "subject": "Copyrighted Personalization",
      "updatedAt": 1776455607854,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Art is Editing Proof {{date}}",
      "daysOut": 1,
      "enabled": false,
      "id": "mo3b9q23thbc6",
      "name": "Editing Proof",
      "subject": "Art Update",
      "updatedAt": 1776455610134,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Confirming Logo with Rep {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo3baxuf179xo",
      "name": "Confirming with Rep",
      "subject": "Art Update",
      "updatedAt": 1776455612320,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Confirming logo with Customer {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo3bc1ecu10x8",
      "name": "Confirming with Customer",
      "subject": "Art Update",
      "updatedAt": 1776455614944,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Trademarked Logo {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo3bcxsafht7a",
      "name": "Trademarked Logo",
      "subject": "Art Update",
      "updatedAt": 1776455617298,
      "subType": "note"
    },
    {
      "audienceVal": "Custom Logo",
      "body": "Inappropriate Logo {{date}}",
      "daysOut": 3,
      "enabled": false,
      "id": "mo3be31gse70w",
      "name": "Inappropriate Logo",
      "subject": "Art Update",
      "updatedAt": 1776455620464,
      "subType": "note"
    }
  ],
  "templates": [
    {
      "body": "Good Morning!\n\nThank you for your recent order with us at Golfballs.com! We truly appreciate your business.\n\nWe wanted to let you know that we received your order, but unfortunately, we were unable to process the card currently on file. To move forward with your order, please update your payment information at your earliest convenience.\n\nYou can do this by:\n1. Click here to add payment: {{payment_link}}\n2. Calling our customer service team at 1-800-372-2557 during our business hours (8am\u20137pm CST), and we'll be happy to help.\n\nThanks so much, and we hope to hear from you soon.",
      "enabled": true,
      "id": "mnnidej3lj7r5",
      "name": "Order Payment Failure",
      "rules": [
        {
          "operator": "exists",
          "selector": "td > div > a:nth-of-type(7)",
          "value": "Add Payment to Order"
        },
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Charge Error"
        }
      ],
      "subject": "Golfballs.com: Payment Issue Follow up \u2013 Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776438777109,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        },
        "payment_link": {
          "builtin": "payment_link",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Good Morning!\n\nThank you for your recent order with us at Golfballs.com! We truly appreciate your business.\n\nWe wanted to let you know that we received your order, but unfortunately, we were unable to process the card currently on file. To move forward with your order, please update your payment information at your earliest convenience.\n\nYou can do this by:\n1. Logging into your account (https://www.golfballs.com/myaccount#Billing) and add/edit your Payment Methods. Once this is done, please respond to this email so we can process your order.\n2. Calling our customer service team at 1-800-372-2557 during our business hours (8am\u20137pm CST), and we'll be happy to help.\n\nThanks so much, and we hope to hear from you soon.",
      "enabled": true,
      "id": "mnnioy3glm0d1",
      "name": "Subscribe and Save Payment Failure",
      "rules": [
        {
          "operator": "notExists",
          "selector": "td > div > a:nth-of-type(7)",
          "value": "Add Payment to Order"
        },
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Charge Error"
        }
      ],
      "subject": "Golfballs.com: Payment Issue Subscribe and Save \u2013 Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776438785379,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Good Morning, \n \nThank you for your recent order with us. Our system flagged the image submitted because it appears to be protected by copyright. Since we don't have permission from the rights holder to reproduce this artwork, we're unable to proceed with printing it as-is. \n \nIf you're able to provide an image that you own or have permission to use, we'll be happy to continue with your order right away. You're welcome to reply here with a new file, and we'll take it from there. \n \nPlease let us know how you'd like to proceed. We're here to help! \n \nBest regards,",
      "enabled": true,
      "id": "mnnnqc52utror",
      "name": "Copyright Material Personalization",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Fraud Screening"
        }
      ],
      "subject": "Copyright Restriction on Submitted Material - Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776438841172,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Good Afternoon,\n\nThank you for your recent order with Golfballs.com!\n\nWe wanted to let you know that one of the items in your order is currently out of stock. We truly apologize for the inconvenience and appreciate your understanding.\n\nHere are the details:\nOut of Stock Item:  {{oos_item}}\nRecommended Replacement:  {{oos_replacement}}\n\nWe've selected this replacement based on similarity in style, performance, and popularity among our customers. If you feel like this will work for you, please let me know and we'll get your order back on track with no additional charge.\n\nIf you'd prefer a different item or would like to wait until the original item is back in stock \u2014 we're happy to accommodate that as well!\n\nPlease let us know how you would like to proceed.",
      "enabled": true,
      "id": "mnoo5p9o4u8u9",
      "name": "Dynamic Order Item Out of Stock",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Dynamics Oos Check"
        }
      ],
      "subject": "Out of Stock Item | Golfballs.com Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1777050397230,
      "vars": {
        "oos_item": {
          "builtin": "oos_item",
          "type": "builtin"
        },
        "oos_replacement": {
          "builtin": "recommended_replacement",
          "type": "builtin"
        },
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Hello,\n\nThank you for your order. I wanted to reach out regarding the logo you submitted. The small text in your logo does not meet our minimum font size requirement for production (6pt). As shown below, the text is currently difficult to read and will likely print the same way. \n\n\nWe can proceed with the logo as is, but please note that the final print may not appear as intended. If you choose to proceed, you would be waiving the right to return the order due to this issue. \n\nIf possible, we recommend providing a revised logo with enlarged text to ensure the best print quality. \n\nPlease let me know how you'd like to move forward.",
      "enabled": true,
      "id": "mnypei8xukbzb",
      "name": "Customization Small Text",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Logo Approval"
        }
      ],
      "subject": "Golfballs.com Fulfillment Issue | Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776438827625,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Thank you for your recent order with us.  \n\nWe wanted to reach out regarding the customization included in your order. It contains language or imagery that falls outside of our content guidelines, specifically related to the use of profanity or inappropriate content.  \n\nWe understand this may be frustrating, and we sincerely apologize for any inconvenience. We're actively working to make these guidelines clearer during the ordering process.    \n\nIf you would like to revise the personalization, we'd be happy to proceed with your order. Alternatively, we can cancel the order and issue a full refund if you would prefer.  \n\nPlease let us know how you would like to proceed at your earliest convenience.  \n\nThank you for your understanding.  ",
      "enabled": true,
      "id": "mo1uhxgv2hoac",
      "name": "Inappropriate Personalization",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Fraud Screening"
        }
      ],
      "subject": "Production Issue | Golfballs.com - Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776366403777,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Thank you for your recent order with Golfballs.com.  \n\nUnfortunately, your order was flagged by our automated fraud screening system and, as a precaution, has been moved to Cancelled Status. Please rest assured that no charges have been made to your account. \n\nWe understand this may be frustrating, and we're here to help. If you believe this was an error or would like to explore alternative ways to complete your purchase, we'd be happy to review the situation and work with you on next steps.  \n\nYou can reach us at 800-372-2557 during regular business hours (8am-6pm CST), or simply reply to this email and a member of our team will follow up with you as soon as possible.  \n\nThank you for your understanding, and we appreciate the opportunity to serve you.  ",
      "enabled": true,
      "id": "mo31xxresstqz",
      "name": "Canceled Order - Fraud Status",
      "rules": [
        {
          "operator": "contains",
          "selector": "table.table.table-striped > tbody > tr:nth-of-type(6) > td",
          "value": "SignifydFailed"
        }
      ],
      "subject": "Cancellation Notice | Golfball.com Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776439959915,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Good Afternoon,\n\nThank you for your recent order with Golfballs.com!\n\nWe wanted to let you know that one of the items in your order is currently out of stock. We truly apologize for the inconvenience and appreciate your understanding.\n\nHere are the details:\nOut of Stock Item:  {{oos_item}}\nRecommended Replacement:  {{oos_replacement}}\n\nWe've selected this replacement based on similarity in style, performance, and popularity among our customers. If you feel like this will work for you, please let me know and we'll get your order back on track with no additional charge.\n\nIf you'd prefer a different item or would like to wait until the original item is back in stock \u2014 we're happy to accommodate that as well!\n\nPlease let us know how you would like to proceed.",
      "enabled": true,
      "id": "mo3eesv7lu3fi",
      "name": "Order Item Out of Stock",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Out Of Stock"
        }
      ],
      "subject": "Out of Stock Item | Golfballs.com Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "updatedAt": 1776460062016,
      "vars": {
        "oos_item": {
          "builtin": "oos_item",
          "type": "builtin"
        },
        "oos_replacement": {
          "builtin": "recommended_replacement",
          "type": "builtin"
        },
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      },
      "type": "order"
    },
    {
      "body": "Thank you for reaching out to our support team. This email is in response to a recent request for an update regarding an order you purchased during the Titleist promotional period.\n\nUnfortunately these orders were required to be shipped directly from the vendor and due to the large quantities of orders they have been delayed. \n\nWe have been notified that those orders should be getting processed in 8-10 days and tracking will be sent out to customers within 2 days of shipment. I apologize for the inconvenience. ",
      "caseRules": [
        {
          "field": "body",
          "op": "contains",
          "value": "update"
        },
        {
          "field": "body",
          "op": "contains",
          "value": "delivery"
        },
        {
          "field": "body",
          "op": "contains",
          "value": "not delivered"
        }
      ],
      "caseTags": [
        {
          "category": "Order Status Update",
          "subcategory": "Tracking Update"
        },
        {
          "category": "Order Status Update",
          "subcategory": "Lost Package"
        },
        {
          "category": "Order Status Update",
          "subcategory": "Drop Ships"
        },
        {
          "category": "Order Status Update",
          "subcategory": "Late Ship"
        }
      ],
      "caseVars": [],
      "enabled": true,
      "id": "mok5aao5izgn7",
      "name": "Titleist Promo Update Request",
      "rules": [],
      "subject": "RE: Titleist Promo Delivery Update ",
      "toField": {
        "type": "auto"
      },
      "type": "case",
      "updatedAt": 1777498437881,
      "vars": {}
    },
    {
      "body": "Good morning,\n\nI hope you are doing well.\n\nI am writing to confirm that we have successfully deleted all personal data associated with your account that was stored in our records and systems. This request has been completed in accordance with our data retention and privacy policies.\n\nPlease note that any information we were required to retain for legal, regulatory, or compliance purposes, if applicable, will continue to be handled securely and in accordance with applicable laws.\n\nIf you have any additional questions or need further assistance, please feel free to reach out and we would be happy to help.",
      "caseRules": [
        {
          "field": "body",
          "op": "contains",
          "value": "Sent using McAfee\u00c2\u00ae Online Account Cleanup"
        }
      ],
      "caseTags": [],
      "caseVars": [
        {
          "field": "body",
          "group": 1,
          "name": "request_id",
          "pattern": "Request ID:\\s*([A-Z0-9]+)"
        }
      ],
      "enabled": true,
      "id": "mokl1se14cnr2",
      "name": "McAfeeA Online Account Cleanup",
      "rules": [
        {
          "operator": "contains",
          "selector": "",
          "value": ""
        }
      ],
      "subject": "Golfballs.com Personal Data Request Confirmation | ID: {{request_id}}",
      "toField": {
        "type": "auto"
      },
      "type": "case",
      "updatedAt": 1777499191770,
      "vars": {}
    },
    {
      "body": "Thank you for reaching out and for taking the time to share your feedback regarding your recent personalized golf ball order.\n\nWe sincerely apologize for the frustration and disappointment you experienced with the durability of the personalization. We completely understand your concerns, especially since you've had positive experiences with similar orders in the past. The quality you described is not the standard we strive to provide.\n\nPlease know that we take feedback like this very seriously. We will have a Print Manager personally oversee the personalization on your next order to help ensure the print quality and durability are much improved.\n\nWe truly appreciate your continued support and the opportunity to do better moving forward.",
      "caseRules": [
        {
          "field": "body",
          "op": "contains",
          "value": "personali"
        }
      ],
      "caseTags": [
        {
          "category": "Product Inquiry",
          "subcategory": "Sale Made - Yes"
        }
      ],
      "caseVars": [],
      "enabled": true,
      "id": "molkh6fw9vd10",
      "name": "Used Balls - Poor Print Quality",
      "rules": [
        {
          "operator": "contains",
          "selector": "",
          "value": ""
        }
      ],
      "subject": "Regarding Your Recent Personalized Golf Ball Order",
      "toField": {
        "type": "auto"
      },
      "type": "case",
      "updatedAt": 1777558569692,
      "vars": {}
    },
    {
      "body": "Thank you for reaching out. We apologize for the concern and frustration regarding your shipment.\n\nWe've reviewed your order and can confirm that it is not lost and is currently in transit with the carrier. We have attached the tracking information below so you can follow the most recent delivery updates:\n\nTracking Link: \n\nWe understand delays can be frustrating and appreciate your patience while the carrier completes delivery. Please let us know if you have any additional questions or if we can assist further.",
      "caseRules": [
        {
          "field": "body",
          "op": "contains",
          "value": "order"
        },
        {
          "field": "body",
          "op": "contains",
          "value": "lost"
        }
      ],
      "caseTags": [],
      "caseVars": [],
      "enabled": true,
      "id": "molnr5fa5adsf",
      "name": "Update on Your Order Shipment",
      "rules": [],
      "subject": "RE: Update on Your Order Shipment | Golfballs.com",
      "toField": {
        "type": "auto"
      },
      "type": "case",
      "updatedAt": 1777564073782,
      "vars": {}
    },
    {
      "body": "Good Afternoon,    \n\nBefore moving your order to the next stage of production, we first need your approval of the Logo Proof attached. Please reply to this email to Approve or Request Changes to the design. \n\nIf you have any questions about the information covered here or within the logo link, please let me know.  \n\nThank you for your time, ",
      "caseRules": [],
      "caseTags": [],
      "caseVars": [],
      "enabled": true,
      "id": "molr2vde4u090",
      "name": "Proof Approval Request",
      "rules": [
        {
          "operator": "contains",
          "selector": "th > b",
          "value": "Logo Approval"
        }
      ],
      "subject": "Golfballs.com - Logo Approval Needed \u2013 Order #{{order_number}}",
      "toField": {
        "type": "auto"
      },
      "type": "order",
      "updatedAt": 1777569659475,
      "vars": {
        "order_number": {
          "builtin": "order_number",
          "type": "builtin"
        }
      }
    }
  ]
};
