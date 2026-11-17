# Building accounting from zero

> Part of the `nito-accounting` skill. The order of work for adding
> accounting to a new or existing ERP, with the file to copy at each step.
> Every asset named here is tested in `test/accounting.mjs`; what is not
> tested is said where it comes up.

Nothing here needs new research. Where a step needs a decision, the decision
and its options are given; where it needs a rate, the rate is in
`values-to-verify.md` with its status.

## 0. Decide five things with the business

| Decision | Options | Where it goes |
|---|---|---|
| Reporting framework | SAK Umum, SAK EP, SAK EMKM (`foundations-and-standards.md`) | company configuration |
| PKP status | PKP or not: decides whether PPN events carry tax | company configuration |
| Inventory costing | moving average or FIFO for tax purposes (`inventory-assets-cash.md`) | `inventory_costing` |
| Fiscal year and currency | calendar year, IDR unless permitted otherwise | periods, functional currency |
| Integration tier | 0 CRM invoicing to 4 full close (`integration-playbook.md`) | which events to wire first |

## 1. Copy the assets into the project

```
assets/posting-core.mjs          the rules and the event catalogue
assets/posting-service.mjs       the service: post, reverse, outbox worker, repositories
assets/reports.mjs               statements, cash flow, open items, aging, dashboard, margin per object
assets/period-close.mjs          closing, opening balances, FX revaluation
assets/inventory-valuation.mjs   moving average and FIFO (only with stock)
assets/seed-sql.mjs              the setup SQL for a company
assets/ledger-schema.prisma      the tables
assets/coa-template-id.json      the default chart
```

They are plain ES modules with no dependencies; TypeScript projects import
them as they are or rename them to `.ts` and add the types from
`integration-playbook.md`.

## 2. Create the tables

1. Paste the models from `ledger-schema.prisma` into the project's schema
   (rename the `T_M_`/`T_L_` prefixes if the project uses others).
2. `npx prisma migrate dev --create-only --name accounting` to get the SQL.
3. Append the CHECK from `starter-implementation.md` to that migration.
4. Run the migration the way the project runs migrations. Then run the
   checks in `sql-checks.md` once on that server, including the CHECK test:
   MariaDB behaviour was not confirmed by the research.

## 3. Set the company up

1. Adapt the chart: add the accounts the company's activity needs
   (`event-catalogue.md`, "Roles and where they usually point"), keep the
   types and flags (`cash_flow`, `pl`, `control`).
2. Fill the default accounts: every role the wired events use. A role without
   an account refuses the posting, on purpose.
3. Generate the setup SQL with `seedSql` (chart, defaults, twelve periods,
   one numbering row per journal and payment journal), review it, run it.
4. Load the tax codes (`T_M_ACC_TAX_CODE`) after checking each rate against
   current regulation; copy the status column from `values-to-verify.md`.

## 4. Wire the service

```js
import mysql from "mysql2/promise";
import { createPostingService, createMysqlRepository } from "./accounting/posting-service.mjs";
const pool = mysql.createPool({ ...config, decimalNumbers: false });   // money stays a string
export const accounting = createPostingService({ repo: createMysqlRepository(pool) });
```

The MySQL repository is written from the documented SQL but was not run
against a database during the research: run `sql-checks.md` and a first
posting by hand before relying on it. One pool per application, never one per
script (connections left open pile up on a shared MariaDB).

## 5. Connect each module

Follow the eight steps of `integration-playbook.md` per module, starting from
the domain file that matches (`domains/crm-invoicing.md`,
`domains/supply-chain.md`, `domains/voyage-shipping.md`,
`domains/other-domains.md`). Default to the outbox; run `drainOutbox` from a
scheduled job and right after the module's commit.

## 6. Build the screens

Use the `nito-design` skill's dense-tool mode (`references/erp.md`). The
minimum set, all reading the ledger:

| Screen | Reads |
|---|---|
| Journal list and entry detail, with reverse | entries and lines |
| Chart of accounts, default accounts, periods (open and close) | masters |
| Payment journals, register payment, allocation | cash banks, `openItems` |
| Bank reconciliation | statement lines, reconciliation records |
| Trial balance, general ledger, statements, cash flow | `trialBalance`, `reports.mjs` |
| Aging, customer and supplier statements | `openItems`, `aging` |
| Dashboard | `kpis`, `byAnalytic` |
| Failed postings | outbox rows in `failed`, with retry |

`example/ledger/` in the nito-skill repo is all of this in one page, running
on `posting-core.mjs`.

## 7. Run the checks as jobs

Daily: trial balance balances, every subledger ties to its control account,
no outbox row has been failing for more than a day. Month end: the checklist
in `close-and-statements.md`, then lock the period. Year end:
`closingEntries`, post them, open the next year's periods and numbering rows.

## Done means

- Every event the ERP uses has a replay test with a worked entry.
- A retried request posts once; a closed period refuses; a refused posting
  consumes no number.
- The trial balance balances and each subledger ties, on the real database.
- The dashboard figures equal the statements for the same dates.
- Cancelling a document reverses its entry; nothing posted was ever updated.
- Rates in use carry the date they were confirmed.
