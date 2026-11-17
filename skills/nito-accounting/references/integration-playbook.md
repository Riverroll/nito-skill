# Connecting any ERP to the ledger

> Part of the `nito-accounting` skill. This file is a **design**: it puts
> together the posting contract (`posting-contract.md`, drawn from how Odoo,
> ERPNext, Oracle and Dynamics work), the outbox pattern (Stripe and
> TigerBeetle idempotency, the transactional-outbox practice cited in the
> research report) and the event catalogue. No vendor documents it in this
> form. The code it names is tested in `test/accounting.mjs`.

The rule underneath everything: **the ERP module owns the operation, the
accounting service owns the ledger.** A CRM owns its invoices, a warehouse its
stock moves, a voyage module its voyages. None of them writes a journal line.
Each sends a posting request (an event, amounts by role, the document it came
from) and the service turns it into a balanced entry. This is what lets one
ledger sit under a CRM today and a full ERP next year without being rebuilt.

## The method, for any module

Work through these eight steps for each module of the ERP being built. The
domain files (`domains/*.md`) have them already done for CRM invoicing,
supply chain, voyage and shipping, and the common other domains.

### 1. List what happens in the module

Write the module's document lifecycle: quotation, order, delivery, invoice,
payment, return, cancellation; or booking, loading, sailing, discharge,
invoice; or work order, issue, completion. Every state change is a
candidate.

### 2. Decide which of them change the books

A step changes the books when it changes **what the company owns, owes or has
earned**. The test is control and obligation, not paperwork (IFRS 15: revenue
when control transfers; IAS 2: inventory when it is owned; see
`foundations-and-standards.md`).

| Usually an accounting event | Usually not |
|---|---|
| Goods delivered or control transferred | Quotation, proposal, price list |
| Invoice issued or received | Sales order, purchase order, booking |
| Money received or paid | Approval, schedule, reservation |
| Goods received into stock, issued, transferred, counted | Planned voyage, planned production |
| Work or a voyage progressing over a period end | Status changes inside one day with no value moving |
| Asset bought, depreciated, sold | A note, an attachment, a reminder |
| Payroll approved and paid | Leave request, attendance |
| Period end: accruals, revaluation, tax | |

When in doubt, ask: if this step were reversed tomorrow, would an accountant
need to post something? If not, it is not an event.

### 3. Pick the event, or add one

Find the shape in `event-catalogue.md`. If none fits, add one by its four
steps (worked entry, `EVENTS`, catalogue row, replay test). Do not post a
module's entry as a manual journal: a manual journal cannot touch control
accounts, and it carries no source.

### 4. Compute the amounts in the module

The module knows the business numbers; the service knows the accounts.

- Prices, discounts and quantities: the module's own logic.
- Tax: from the effective-dated tax codes (`T_M_ACC_TAX_CODE`) with
  `percentOf`, never a constant. Rates and their status are in
  `values-to-verify.md`.
- Cost of stock issued: `assets/inventory-valuation.mjs` (moving average or
  FIFO), in the stock module.
- Amounts are decimal strings (`"105450000.00"`), never JavaScript numbers.
- An invoice whose lines go to different revenue or expense accounts sends a
  role as parts: `sales: [{ amount, account, analytic_ref }, ...]`. The
  account of a part comes from configuration the module owns (the product
  category's revenue account), never from a field a user types.

### 5. Name the source, the key, the party and the dimensions

| Field | Rule | Example |
|---|---|---|
| `source_type`, `source_id` | The module's document; copied onto the entry so every line traces back | `crm_invoice`, `INV-2026-00123` |
| `idempotency_key` | Unique per posting; same request again returns the first entry | `crm_invoice:INV-2026-00123:issue:v1` |
| `party` | The customer or supplier id the module uses; required on control accounts | `CUST-0042` |
| `dimensions` | Cost centre, site, project, and `analytic_ref` for the operational object | `{ analytic_ref: "VOY-2026-014" }` |
| `posting_date` | The business date of the event, not the server clock | delivery date, invoice date |
| `due_date` | For invoices: what the aging report reads | invoice date + terms |

The key carries a version: when a document is corrected after posting, the
correction posts with `:v2` after the `:v1` entry is reversed.

### 6. Send it: outbox or direct call

**Outbox (the default for anything bigger than one database).** The module
writes its document and the posting request in **one** transaction; a worker
posts the request. A crash between the two cannot lose a posting or make two.

```js
// in the module, inside its own transaction
await tx.insert("CRM_INVOICE", invoice);
await tx.insert("T_L_ACC_POSTING_REQUEST", outboxRow(companyId, {
  event_type: "service_invoice",
  idempotency_key: `crm_invoice:${invoice.no}:issue:v1`,
  source_type: "crm_invoice", source_id: invoice.no,
  posting_date: invoice.date, document_date: invoice.date, due_date: invoice.due_date,
  created_by: user.id, party: invoice.customer_id,
  amounts: { receivable: invoice.total, service_revenue: invoice.dpp, tax_output_ppn: invoice.ppn },
}));

// the worker, on a schedule or right after commit
await accounting.drainOutbox({ company_id: companyId, journalFor: (r) => JOURNAL_OF[r.source_type] });
```

**Direct call (a small app with accounting in the same database).** Call
`accounting.post(request, { company_id, journal_code })` after the module's
commit and show its errors to the user. If the call fails after the commit,
the document exists without its entry; the reconciliation job in step 8 finds
it. The outbox removes that gap, which is why it is the default.

`assets/posting-service.mjs` has both: `post`, `reverse`, `drainOutbox`,
`outboxRow`, an in-memory repository and a MySQL one.

### 7. Edits and cancellations

A posted entry is never edited (`controls-retention.md`). In the module:

| The user does | The module sends |
|---|---|
| Cancels an invoice | `reverse` of its entry, then marks its own document cancelled |
| Edits an invoice after posting | `reverse` of the `:v1` entry, then the new figures as `:v2` |
| Edits a draft never posted | nothing; no entry exists yet |
| Posts into a closed period | nothing posts; the service refuses, the module shows why and lets the user pick an open date |

Refuse a cancellation while another open document depends on it (a payment
allocated to the invoice, depreciation run on the asset); undo that first.

### 8. Reconcile, then show

Each control and clearing account the module feeds gets a check, run as a
job (`sql-checks.md` has the queries):

| Account | Must equal |
|---|---|
| Piutang Usaha | Open items per customer (`reports.mjs` `openItems`) |
| Utang Usaha | Open items per supplier |
| Persediaan | The stock module's value per item and location |
| GR/IR, landed-cost clearing, contract liability per voyage | Zero once matched, or the open documents |
| Aset Tetap, Akumulasi Penyusutan | The asset register by class |
| Utang PPN, PPh | The tax registers and bukti potong |
| Every module | Every document in a posting state has an entry (no outbox row stuck in `failed`) |

The dashboard reads the ledger, not the module: `reports.mjs` `kpis` (cash,
receivables, payables, revenue, profit, margin), `aging`, `byAnalytic` (margin
per voyage, shipment, project), and the statements. A CRM that only issues
invoices gets the same dashboard as a full ERP.

## Integration tiers

Start at the tier the ERP needs today. Each tier adds events and accounts; the
ledger, the service and the reports do not change.

| Tier | The ERP has | Events | Accounts to add to the template | Reports that work |
|---|---|---|---|---|
| 0 | CRM or billing: customers, invoices, payments | `sale_invoice` or `service_invoice`, `receipt_in`, `sale_return`, `customer_advance`, `advance_earned`, `advance_billing`, `revenue_over_time` | Bank per payment journal | Revenue, receivables, aging, cash, profit (revenue less nothing yet), dashboard |
| 1 | + purchasing and expenses | `vendor_service_invoice`, `payment_out`, `accrual`, `prepayment`, `prepaid_release`, `cash_payment_other`, tax events | Expense accounts by nature, Utang PPN, Utang PPh | Full profit and loss, payables, PPN settlement |
| 2 | + stock | `goods_receipt`, `vendor_invoice`, `sale_cogs`, `landed_cost`, `stock_*`, returns | GR/IR, in-transit, one stock account per location if needed | Gross margin, stock tie-out |
| 3 | + payroll and fixed assets | `payroll_*`, `thr_accrual`, `asset_*`, `depreciation` | Payroll payables, BPJS, asset classes | Statements complete for a trading or service company |
| 4 | + multi-currency, group, close | `fx_revaluation_*`, `intercompany_*`, `current_tax`, `deferred_tax`, closing | FX accounts, intercompany, deferred tax | Cash flow, closed years, group view |

A domain module (voyage, construction, manufacturing) sits on top of the tier
its company needs and adds its own events from the domain file.

## The module-to-event map

| ERP module | Documents | Events |
|---|---|---|
| CRM, billing, subscriptions | Invoice, credit note, receipt, deposit | `sale_invoice`, `service_invoice`, `sale_return`, `receipt_in`, `customer_advance`, `advance_earned`, `credit_loss_provision`, `receivable_write_off` |
| Purchasing, expenses | PO (none), goods receipt, supplier invoice, payment, advance | `goods_receipt`, `vendor_invoice`, `vendor_service_invoice`, `payment_out`, `vendor_advance`, `purchase_return`, `import_purchase`, `accrual` |
| Inventory, warehouse | Receipt, delivery, transfer, count, consumption, valuation | `goods_receipt`, `sale_cogs`, `stock_transfer_out`, `stock_transfer_in`, `stock_shortage`, `stock_issue`, `inventory_writedown`, `landed_cost` |
| Manufacturing | Work order, material issue, completion | `wip_material`, `wip_labour`, `overhead_applied`, `overhead_incurred`, `production_complete`, `overhead_close`, `standard_cost_receipt` |
| Treasury, cash | Bank statement, transfer, petty cash | `cash_transfer`, `cash_receipt_other`, `cash_payment_other`, `fx_revaluation_*` |
| HR, payroll | Payroll run, payment, THR | `payroll_accrual`, `payroll_payment`, `payroll_remittance`, `thr_accrual`, `pph21_true_up` |
| Fixed assets | Acquisition, depreciation run, disposal | `asset_acquisition`, `depreciation`, `asset_disposal` |
| Voyage, freight | Voyage, freight invoice, laytime statement, bunker report | `advance_billing`, `revenue_over_time`, `demurrage_claim`, `demurrage_invoice`, `bunker_consumption`, `stock_issue` |
| Tax | Masa PPN, payments, year end | `ppn_settlement`, `tax_payment`, `final_tax`, `current_tax`, `deferred_tax` |

## The request, as a type

```ts
type Money = string;                       // "105450000.00", never a number
type Part = { amount: Money; account?: string; analytic_ref?: string; description?: string };
interface PostingRequest {
  event_type: string;                      // a key of EVENTS
  idempotency_key: string;                 // source_type:source_id:action:vN
  source_type: string; source_id: string;
  posting_date: string; document_date: string; due_date?: string;   // YYYY-MM-DD
  created_by: number;
  party?: string;                          // customer or supplier id
  dimensions?: { cost_center_id?: number; site_id?: number; project_id?: number; analytic_ref?: string };
  description?: string;
  amounts: Record<string, Money | Part[]>; // by role, see event-catalogue.md
  roles?: Record<string, string>;          // per-request accounts: the chosen bank, an expense line
}
```

## What goes wrong, and the rule that prevents it

| Mistake | Rule |
|---|---|
| The module inserts journal lines itself | Only the service writes the ledger |
| An invoice edit updates the posted entry | Reverse and post again with a new version key |
| A retry posts twice | Idempotency key, unique in the database |
| Money as a float in JSON | Decimal strings end to end |
| A missing account falls back to suspense | A missing role refuses the posting |
| The dashboard reads module tables | It reads the ledger, so it ties to the statements |
| Tax rate typed in code | Effective-dated tax codes, re-verified |
| The server clock as posting date | The business date of the event |
| One revenue account for every product | Parts with the category's account |
| A failed posting nobody sees | Outbox rows in `failed` shown to a person and retried |
