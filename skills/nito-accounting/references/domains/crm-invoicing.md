# CRM and billing: accounting from invoices alone (tier 0)

> Part of the `nito-accounting` skill. A **design** built on the integration
> playbook (`../integration-playbook.md`); the entries are the worked entries
> A1-A4 of `../ar-ap-ppn.md` and E9/E14 of `../journals-and-gl.md`, plus CR1,
> CONSTRUCTED here (amounts invented, rules sourced where stated).

A CRM that issues invoices and records payments already has everything a
ledger needs for revenue, receivables, cash and a dashboard. Nothing in the
CRM changes shape: it keeps its customers, invoices and payments, and sends
one posting request per state change.

## What the CRM sends

| CRM step | Event | Amounts the CRM computes | Key |
|---|---|---|---|
| Invoice issued (goods) | `sale_invoice` | `receivable` = total, `sales` = DPP (or parts per product category), `tax_output_ppn` | `crm_invoice:{no}:issue:v1` |
| Invoice issued (service) | `service_invoice` | `receivable`, `service_revenue`, `tax_output_ppn` | same |
| Subscription or retainer billed ahead | `advance_billing` | `receivable`, `contract_liability` = DPP, `tax_output_ppn` | same |
| Month end on a subscription | `revenue_over_time` | `contract_liability` = DPP / months, `earned_revenue` | `crm_sub:{no}:{yyyy-mm}` |
| Deposit received before any invoice | `customer_advance` | `bank`, `customer_advance` (and `tax_output_ppn` if a Faktur Pajak is due on the advance) | `crm_deposit:{no}` |
| Final invoice after a deposit | `sale_invoice` or `service_invoice` with `customer_advance` | the advance deducted from `receivable` | `crm_invoice:{no}:issue:v1` |
| Payment received | `receipt_in` | `bank` (journal chosen), `prepaid_tax_22_23_25` if the customer cut PPh 23, `bank_charges`; `receivable` = what it settles | `crm_payment:{no}` |
| Credit note | `sale_return` | `sales_return`, `tax_output_ppn`, `receivable` | `crm_credit:{no}` |
| Invoice cancelled | `reverse` of the issue entry | | |
| Invoice edited after issue | `reverse`, then the new figures with `:v2` | | |

Then allocate each receipt to the invoices it pays (`T_L_ACC_ALLOCATION`):
that is what makes an invoice "paid" in the ledger, and what the aging reads.
The CRM may keep its own paid flag; the ledger's open items are the truth the
balance sheet ties to.

## The worked entries

| Ref | CONSTRUCTED entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| CR1 | Annual subscription billed ahead, DPP 12,000,000, PPN 1,320,000 (12% x 11/12) | Piutang Usaha 13,320,000 | Pendapatan Diterima di Muka 12,000,000; PPN Keluaran 1,320,000 | 13,320,000 |
| CR1 | One month earned (12,000,000 / 12) | Pendapatan Diterima di Muka 1,000,000 | Pendapatan Langganan 1,000,000 | 1,000,000 |
| CR2 | Customer pays the subscription in full | Bank 13,320,000 | Piutang Usaha 13,320,000 | 13,320,000 |

Revenue on a subscription is recognised as the service is provided, not when
billed (IFRS 15 over-time recognition, STANDARD at summary level, see
`../ar-ap-ppn.md`). When the Faktur Pajak is due on a billing ahead follows
the PPN rules in `../ar-ap-ppn.md` (advance receipts and billing), which the
research marked partly UNVERIFIED.

## What the CRM needs to add

1. The company configuration and default accounts (`../posting-contract.md`),
   seeded with `assets/seed-sql.mjs`.
2. A revenue account per product category, if it wants revenue by category.
   The invoice sends its lines as parts with that account.
3. Payment journals (one per bank account), so a receipt can say where the
   money went.
4. The outbox row written with the invoice, and the worker
   (`assets/posting-service.mjs`).
5. A screen for failed postings: the outbox rows in `failed`, with the error,
   and a retry button.

## The dashboard it gets

All from the ledger, through `assets/reports.mjs`:

| Tile or report | Function |
|---|---|
| Cash and bank | `kpis().cash_and_bank` |
| Receivables, overdue | `kpis().receivables`, `aging(openItems(...))` |
| Revenue this month and this year | `kpis().revenue_period`, `revenue_ytd` |
| Profit (revenue less whatever costs are posted) | `kpis().net_profit_ytd` |
| Revenue by product category or by project | `incomeStatement().lines`, `byAnalytic()` |
| Customer statement | `openItems` filtered by party |

With only invoices and receipts, profit equals revenue. That is correct for
the data the ledger has; adding tier 1 (expenses) makes it a real profit.
