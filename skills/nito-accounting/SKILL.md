---
name: nito-accounting
description: Accounting knowledge and a tested build kit for ERP systems, Indonesian context included. Use whenever work touches accounting in software - chart of accounts (COA), journal entries, general ledger (GL), accounts receivable (AR), accounts payable (AP), inventory valuation and COGS, fixed assets and depreciation, cash and bank, bank reconciliation, payroll with BPJS and PPh 21, PPN and PPh withholding, multi-currency, period close, financial statements, cash flow, financial dashboards, PSAK/SAK - or when building accounting from scratch, designing ledger tables or posting logic, or connecting any ERP module to accounting (CRM or billing that only issues invoices, sales, purchasing, supply chain and warehouse, manufacturing, voyage and shipping, projects, fleet, payroll, assets). Also use to answer any accounting question ("jurnal untuk...", "debit kredit...", "cara posting...", "akuntansinya gimana") and for onboarding the team on accounting.
---

# Accounting for ERPs

One accounting core, reused in every ERP. What changes per company is data:
the chart of accounts and the company configuration. What changes per year is
the tax and payroll parameters. The ledger logic does not change, and neither
does the way a module connects to it.

The research behind this skill is dated 16-17 November 2026 and kept in the
nito-skill repo at `research/erp-accounting-implementation-guide.md`. Each
claim carries an evidence label (`references/evidence-labels.md`). Keep the
label when you repeat a claim: say "unverified" when the reference says
unverified.

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
6. **Modules never write ledger rows.** Sales, purchasing, inventory, payroll,
   assets, a CRM, a voyage module: each sends a posting request (an event and
   amounts by role); the accounting service decides the accounts from
   configuration and writes the entry in one transaction.
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
| Building accounting from zero: the order of work and what to copy | `references/build-from-zero.md` |
| Connecting any ERP module; integration tiers; outbox; edits and cancellations; dashboards | `references/integration-playbook.md` |
| A CRM or billing system that only issues invoices; subscriptions; deposits | `references/domains/crm-invoicing.md` |
| Purchasing, warehouse, stock moves, landed cost, deliveries | `references/domains/supply-chain.md` |
| Voyages, charters, freight, demurrage, bunkers, PPh 15, PPN on shipping | `references/domains/voyage-shipping.md` |
| Manufacturing, projects and construction, trucking, rental, retail, services, group companies | `references/domains/other-domains.md` |
| Which event to send, its roles, the account each role usually points to | `references/event-catalogue.md` |
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
| The ledger tables, the posting transaction, reversal, several bank accounts, reconciliation | `references/starter-implementation.md` |
| The posting request and company configuration fields; account-determination keys | `references/posting-contract.md` |
| Queries to verify the tables, reconcile, and feed a BI dashboard | `references/sql-checks.md` |
| Teaching the team: accounting for developers, in Bahasa Indonesia | `references/team-primer-id.md` |
| Any rate, cap, threshold, deadline or regulation number | `references/values-to-verify.md` |
| What a label such as STANDARD, LAW, SECONDARY, CONSTRUCTED or UNVERIFIED means | `references/evidence-labels.md` |

Read only the files the question needs.

## The code to copy

| Asset | Gives you |
|---|---|
| `assets/posting-core.mjs` | The rules and the event catalogue |
| `assets/posting-service.mjs` | The service an ERP calls: post, reverse, outbox worker; in-memory and MySQL repositories |
| `assets/reports.mjs` | Statements, cash flow, open items, aging, dashboard KPIs, margin per voyage or project |
| `assets/period-close.mjs` | Year-end closing, opening balances, FX revaluation |
| `assets/inventory-valuation.mjs` | Moving average and FIFO |
| `assets/payroll-calc.mjs` | BPJS, PPh 21 TER and Pasal 17, net pay, the payroll accrual amounts |
| `assets/payroll-params-id.json` | The payroll parameters, editable, each with its status |
| `assets/seed-sql.mjs` | The setup SQL for a company |
| `assets/ledger-schema.prisma` | The tables |
| `assets/coa-template-id.json` | The default chart |

All of it is tested by `test/accounting.mjs` in the nito-skill repo, against
the worked entries in the references. `example/ledger/` in the repo is a
working ERP screen set built on it.

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
6. If the question is about software, name the event from
   `references/event-catalogue.md` and the asset that does the work.

The worked entries in the references are constructed illustrations: the
amounts are invented, the rules are sourced. `test/accounting.mjs` re-adds
every one of them.

## Building accounting into an ERP

Follow `references/build-from-zero.md`: decide five things, copy the assets,
create the tables, seed the company, wire the service, connect each module by
the eight steps of `references/integration-playbook.md`, build the screens,
run the checks. Even an ERP that is only a CRM issuing invoices gets the
ledger, the statements and the dashboard this way (tier 0).

The module structure and the posting contract are a design drawn from how
Odoo, ERPNext, Oracle and Dynamics work. No single vendor documents it in
this form, and the references say so.

## Limits

- This is a guide for building software. It does not replace an accountant or
  a tax consultant, and it is not tax or legal advice.
- No PSAK paragraph text was opened during the research; PSAK rules are the
  IFRS rules mapped through IAI's numbering. The shipping and voyage rules
  rest on secondary sources.
- The MySQL repository and the SQL were not run against a database.
- Sector-specific charts and rules (banks, insurers, cooperatives,
  state-owned companies, Sharia entities) are not covered.
