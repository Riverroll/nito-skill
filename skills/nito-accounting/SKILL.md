---
name: nito-accounting
description: Accounting knowledge and implementation guide for building ERP systems, Indonesian context included. Use whenever work touches accounting in software - chart of accounts (COA), journal entries, general ledger (GL), accounts receivable (AR), accounts payable (AP), inventory valuation and COGS, fixed assets and depreciation, cash and bank reconciliation, payroll with BPJS and PPh 21, PPN and PPh withholding, multi-currency, period close, financial statements, PSAK/SAK - or when designing ledger tables, posting logic, or connecting an ERP module (sales, purchasing, inventory, payroll, assets) to accounting. Also use to answer any accounting question ("jurnal untuk...", "debit kredit...", "cara posting...").
---

# Accounting for ERPs

One accounting core, reused in every ERP. What changes per company is data:
the chart of accounts and the company configuration. What changes per year is
the tax and payroll parameters. The ledger logic does not change.

Everything here comes from a research report dated 16 November 2026, kept in
this repo at `research/erp-accounting-implementation-guide.md`. Each claim
carries an evidence label (`references/evidence-labels.md`). Keep the label
when you repeat a claim: say "unverified" when the reference says unverified.

## Rules that hold in every ERP

1. **Every entry balances.** Total debits equal total credits, per entry, in
   the transaction currency and in the functional currency.
2. **Debit is a side, not an increase.** Whether a debit increases an account
   depends on the account's type. See the normal-balance table in
   `references/foundations-and-standards.md`.
3. **Posted entries are never edited or deleted.** A correction is a new
   reversing entry plus a new correct entry. Both stay in the ledger.
4. **Money is never a float.** Use `DECIMAL` with an explicit precision in
   MariaDB/MySQL and a decimal type in code (Prisma `Decimal`). Set the
   precision yourself; the default is not suitable.
5. **The engine keys off account type and flags, never off account numbers.**
   This is what lets the chart be swapped per company.
6. **Modules never write ledger rows.** Sales, purchasing, inventory, payroll
   and assets send a posting request; the accounting service decides the
   accounts from configuration and writes the entry in one transaction.
7. **Every ledger line stores the document that caused it**, and every posting
   request carries an idempotency key, so a retry cannot post twice.
8. **Subledgers reconcile to control accounts.** AR and AP open items, stock
   value, the asset register and the tax registers must each equal their GL
   account. Run these as jobs, not as a year-end exercise.
9. **Never hard-code a rate, cap, threshold or deadline.** They live in
   effective-dated parameters. Before quoting or using one, read
   `references/values-to-verify.md`: several are unverified or disputed
   between sources, and all of them change over time.

MariaDB/MySQL cannot enforce rule 1 or gapless numbering with a constraint.
Both belong in application code inside one transaction; the reasons and the
pattern are in `references/real-systems-db-enforcement.md`.

## Which file answers which question

| The question is about | Read |
|---|---|
| Debit and credit, account types, accrual, which standard applies (SAK Umum, SAK EP, SAK EMKM), PSAK numbers old and new | `references/foundations-and-standards.md` |
| Designing or reviewing a chart of accounts, control accounts, dimensions | `references/chart-of-accounts.md`, template in `assets/coa-template-id.json` |
| How to journal something; adjusting, reversing, closing, correcting and opening entries; trial balance | `references/journals-and-gl.md` |
| Month-end and year-end close, period locks, deriving the financial statements | `references/close-and-statements.md` |
| Foreign currency, exchange rates, revaluation | `references/multi-currency.md` |
| Internal controls, audit trail, record retention, common engineering mistakes | `references/controls-retention.md` |
| Sales and receivables, purchasing and payables, PPN (VAT), Faktur Pajak | `references/ar-ap-ppn.md` |
| Inventory valuation and COGS, fixed assets, depreciation, leases, cash, bank reconciliation | `references/inventory-assets-cash.md` |
| Payroll, BPJS, PPh 21 (TER), THR, severance | `references/payroll.md` |
| Corporate income tax, PPh withholding, final tax, accruals, dividends, intercompany | `references/income-tax-other-cycles.md` |
| Table design, what the database can enforce, how Odoo, ERPNext, Oracle and Dynamics do it | `references/real-systems-db-enforcement.md` |
| Building the ledger: tables, the posting transaction, a tested posting core to copy | `references/starter-implementation.md`, with `assets/ledger-schema.prisma` and `assets/posting-core.mjs` |
| Starting accounting in a new ERP, connecting a module, the posting request, account determination, reconciliation jobs | `references/posting-contract.md` |
| Any rate, cap, threshold, deadline or regulation number | `references/values-to-verify.md` |
| What a label such as STANDARD, LAW, SECONDARY, CONSTRUCTED or UNVERIFIED means | `references/evidence-labels.md` |

Read only the files the question needs.

## Answering an accounting question

1. Open the file from the table above.
2. Give the entry as accounts with debit and credit amounts, Indonesian
   account names first. Check that it balances before you send it.
3. Name the rule and its source as the reference states them, with the label.
4. If the answer depends on a rate or a cap, take it from
   `references/values-to-verify.md`, state its date and status, and say that
   it must be confirmed against the current regulation.
5. If the answer depends on the company (framework, PKP status, costing
   method, fiscal year, currency), say which setting decides it and ask if it
   is unknown.

The worked entries in the references are constructed illustrations: the
amounts are invented, the rules are sourced. `test/accounting.mjs` re-adds
every one of them.

## Starting accounting in a new ERP

1. Load the chart template (`assets/coa-template-id.json`) and adapt it. The
   template is a constructed skeleton, not an official chart.
2. Fill the company configuration: framework, bookkeeping basis, costing
   method, PKP status, fiscal year, currencies, numbering, default accounts.
   The fields are listed in `references/posting-contract.md`.
3. Build the ledger and the posting service first: balanced header-and-line
   entries, draft and posted states, reversal, period locks, numbering.
   Start from `references/starter-implementation.md`: copy the schema and
   the posting core instead of designing them again. `example/ledger/` in
   the nito-skill repo is a working ERP built on them, to read before
   writing the service.
4. For each module the ERP has, implement its events from the catalogue in
   `references/posting-contract.md` and map its documents to a source type.
5. Fill the account-determination keys. A missing key rejects the posting; do
   not fall back to a suspense account.
6. Add the reconciliation jobs for each subledger.
7. Load the tax and payroll parameters as effective-dated data, after
   confirming each value against the current regulation.

The module structure and the posting contract are a design drawn from how
Odoo, ERPNext, Oracle and Dynamics work. No single vendor documents it in
this form, and the reference says so.

## Limits

- This is a guide for building software. It does not replace an accountant or
  a tax consultant, and it is not tax or legal advice.
- No PSAK paragraph text was opened during the research; PSAK rules are the
  IFRS rules mapped through IAI's numbering.
- Sector-specific charts and rules (banks, insurers, cooperatives,
  state-owned companies, Sharia entities) are not covered.
