# Billory

An offline invoice app for Windows — invoice your clients, track who's paid and
who hasn't, and export clean PDFs. No account, no subscription, nothing leaves
your computer.

Built for freelancers invoicing clients abroad: invoice in the client's
currency, record the rate at issue and at payment, and keep the home-currency
figure your own records need.

## Features

- Outstanding / overdue / paid-this-month dashboard — who owes you, at a glance
- Invoices, quotes and credit notes with live totals; quote → invoice in one click
- Partial payments with running balance; payment method/reference/FX per payment
- Multi-currency with FX rate at issue and at payment (manual entry, no network)
- Tax: invoice-level or per-line, inclusive or exclusive, named rates,
  withholding tax shown as a deduction, "not registered" mode
- Sequential numbering allocated on issue (`INV-2026-0042`), per-year or per-client
- Recurring invoices (prepares the next draft on the due date)
- Payment reminder drafts (polite / firm / final) — copies text, never sends
- Statement of account per client (running balance PDF)
- Time entries that roll into invoice lines
- PDF export via vector printToPDF, CSV export of everything, JSON backup/restore
- Atomic saves + snapshots — financial records, treated like it

## Develop

```
npm install
npm run dev
```

## Build (Windows)

```
npm run dist:win
```

`identityName` and `publisher` in `package.json → build.appx` come from Partner
Center's Product Identity page — fill them in there, never by hand.
