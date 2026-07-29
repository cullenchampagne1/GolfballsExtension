# Custom Pages Lab

This is a local, write-disabled preview for the extension's real Contact,
Account, Opportunity, CRM Search, and Action Review custom-page components. It
imports those components directly and supplies the same data shape as the live
custom-pages engine.

Run:

```sh
npm run custom-pages:lab
```

Open `http://127.0.0.1:4174`. The toolbar switches page and fixture mode:

- **Populated** exercises every visible panel and common status.
- **Stress data** fills capped tables and scroll areas with large datasets.
- **Empty states** verifies missing/zero-data presentation.

External CRM requests and navigation are blocked in the lab. This is a design
and interaction preview, not a sandbox for testing CRM writes.
