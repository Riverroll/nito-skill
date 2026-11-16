# Company configuration and the posting contract (design inference)

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## What changes per ERP: the company configuration

The brief names five variables. The notes support each as a configuration field, and the first four map to documented systems (ERPNext's Company defaults and chart template choice; Odoo's localisation template with property accounts and taxes; Dynamics' ledger as chart plus calendar plus currency).

| Field | Allowed values and rule | Basis |
|---|---|---|
| `chart_template` and `account_code_digits` | Template file plus the per-company account set; engine keys off account type and flags, never the number | Odoo `l10n_id`, ERPNext `create_chart_of_accounts_based_on` |
| `reporting_framework` | SAK Internasional, SAK Umum, SAK EP, SAK EMKM, plus Sharia overlay; no move to a lower pillar | KSPKI deck |
| `bookkeeping_basis` | accrual or cash, applied consistently; change needs DJP approval | UU KUP Pasal 28 |
| `inventory_costing` | moving average, FIFO, specific identification, standard cost; for tax only average or FIFO per secondary sources | IAS 2, PwC |
| `pkp_status`, `npwp`, `branch_registrations` | Controls whether PPN Keluaran and Masukan accounts and Faktur Pajak events are active | UU PPN, DJP |
| `tax_parameter_set` | Effective-dated rates, thresholds and codes referenced by id | params file |
| `fiscal_year_start` | Calendar year or another book year; period calendar generated from it | UU KUP Pasal 1 and 28, DJP |
| `functional_currency`, `presentation_currency` | IDR unless the Minister has permitted another; ISO 4217 exponent per currency | UU KUP, PMK 196/2007 summary, SIX list-one |
| `fx_rate_policy` | Accounting rate source (documented choice) and a separate tax rate source (KMK) | IAS 21, BI, DJP |
| `payroll_parameters` | PTKP, TER tables, BPJS rates and caps, JKK class, effective-dated | DJP, PP 44-46/2015 |
| `numbering` | Per-journal prefix and format, counter-row locking; Faktur Pajak numbers handled separately | MySQL docs, Odoo sequence mixin |
| `close_policy` | Lock dates, maker-checker, 13th period flag | engineering practice (UNVERIFIED as rules) |
| `default_accounts` | The determination keys below | ERPNext Company defaults, Odoo property accounts |


## The posting contract

The contract is the single write path. A module never inserts ledger rows; it submits a **posting request** to the accounting service, which validates it, applies account determination from configuration and writes balanced lines in one transaction, returning the journal number. This follows ERPNext's `make_gl_entries` as the single write path, Oracle's event-then-rules-then-journal flow and Dynamics' posting profiles, and it carries the source reference that all four systems store on lines.

| Contract field | Meaning | Rests on |
|---|---|---|
| `company_id`, `legal_entity` | Ledger owner | Dynamics (one ledger per legal entity), ERPNext |
| `idempotency_key` | Unique per posting request; a replay returns the first result and a parameter mismatch is an error | Stripe, TigerBeetle `id`, outbox |
| `event_type` | From the event catalogue below | Oracle SLA event |
| `source_type`, `source_id`, `source_line_id` | Document that caused the posting, copied onto every line | ERPNext `voucher_type`, `voucher_no`, `voucher_detail_no`; Dynamics voucher |
| `posting_date`, `document_date`, `tax_point_date` | Three dates: revenue or stock event, document, tax event | subledger notes (three dates on a sale) |
| `currency`, `transaction_amount`, `rate`, `rate_source`, `rate_date` | Per line; the service computes the Rupiah amount | IAS 21, Odoo and ERPNext line fields |
| `party_type`, `party_id` | Counterparty, drives control-account subledger | ERPNext party, Odoo partner |
| `lines[]` | Business amounts by role (for example `revenue`, `tax_output`, `receivable`), not account numbers | account determination |
| `tax[]` | Tax code, DPP, nilai-lain flag, rate id, creditable flag, credit-by Masa Pajak, Faktur number | Odoo tax lines, PPN notes |
| `dimensions` | Cost centre, project, site or branch, department | ERPNext Accounting Dimensions, Odoo analytics, Dynamics |
| `intercompany_counterparty` | Entity code for mirror booking and elimination | multi-entity note |
| `maker`, `approval_ref` | Segregation of duties | OpenStax 8.2 |

The service's validators are the eight listed in `controls-retention.md`, and its outputs are a journal number, a state (draft, posted, reversed), and for any correction a **reversal request** referencing the original `source_id` rather than an update. The event catalogue is derived from the cycles above; each event's debit-and-credit shape is exactly the constructed entry named.

| Module | Events and the entry shape they must produce |
|---|---|
| Sales (AR) | delivery or control transfer (A1: receivable, sales, output PPN; COGS and inventory); advance received (A3); receipt with withholding split (A2); return (A4); ECL run (A5); write-off (A6) |
| Purchasing (AP) | goods receipt to GR/IR (P1); vendor invoice with creditable or non-creditable PPN (P1, P4); service invoice and withholding at payment (P2, P3); import (P5); return (P6); prepayment (P7); period-end accrual (P8); foreign service with PPh 26 and self-assessed PPN (P9) |
| Inventory | valuation movements (I1), NRV write-down (I2), transfer through in-transit (I3), count adjustment (I4), issue to cost centre (I5), production flow and overhead (I6), standard cost variance (I7) |
| Fixed assets | capitalisation with CIP (F1), monthly commercial and fiscal depreciation (F2), disposal (F3), lease commencement and payments (F4), impairment (F5) |
| Payroll | monthly accrual (PY1), net pay and remittance (PY2, PY3), THR accrual (PY4), last-period PPh 21 (PY5) |
| Cash and bank | statement-line matching and reconciling items (C1), petty cash (C2), advances (C3), gateway clearing (C4), FX revaluation (C5) |
| Tax | PPN settlement (V2, V3), current and deferred tax (T2), final tax (T1) |
| Treasury and equity | accruals, dividends, intercompany, share issue (O1-O6) |

Account determination keys follow ERPNext's default-account fields and Odoo's property accounts, extended for the Indonesian taxes in the constructed chart: `receivable`, `payable`, `inventory`, `stock_received_not_billed` (GR/IR), `inventory_in_transit`, `cogs`, `sales`, `sales_return`, `service_revenue`, `customer_advance`, `vendor_advance`, `tax_output_ppn`, `tax_input_ppn`, `tax_input_ppn_noncreditable`, `ppn_receivable`, `ppn_payable`, `wht_payable_21`, `wht_payable_23`, `wht_payable_26`, `wht_payable_4_2`, `prepaid_tax_22_23_25`, `ecl_allowance`, `accumulated_depreciation`, `depreciation_expense`, `cip`, `fx_realised_gain_loss`, `fx_unrealised_gain_loss`, `round_off`, `write_off`, `suspense`, `retained_earnings`, `current_year_earnings`, `income_summary`, `payroll_payable`, `bpjs_employment_payable`, `bpjs_health_payable`, `thr_accrual`, `intercompany_receivable`, `intercompany_payable`. A missing key rejects the posting, because Oracle's documented fallback to a suspense account for end-dated accounts comes only from search snippets (UNVERIFIED) and a suspense fallback hides configuration errors.

The cross-module reconciliations the contract must make cheap, each already named in the notes, are: AR and AP open items equal their control accounts; the stock ledger value equals the inventory account by account and warehouse (ERPNext `stock_value_difference`, Odoo `account_move_id` on valuation layers); the GR/IR and gateway and in-transit clearing accounts net to zero after matching (Stripe's clearing test); the fixed-asset register's cost and accumulated depreciation equal the GL by class; payroll register totals equal salary expense and each liability; PPN accounts equal the Faktur Pajak register, prepaid PPh equals the bukti potong register, and Utang PPh equals the withholding register. A new ERP integrates by implementing the event for each module it has, mapping its documents to `source_type`, filling the determination keys, loading the chart template and parameter set, and passing the test suite's ledger invariants; it does not touch ledger tables.
