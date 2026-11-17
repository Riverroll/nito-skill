# Starter implementation: schema, posting core and the posting transaction

> Part of the `nito-accounting` skill. Everything in this file is a **design**
> drawn from the sourced findings in `real-systems-db-enforcement.md` and
> `posting-contract.md`. No vendor documents it in this form. The two asset
> files are tested as described below; the SQL transaction is **not** tested
> against a database and must be run against the project's own MariaDB/MySQL
> before it is trusted.

Use this when an ERP needs accounting and has none yet. Copy the two assets,
then extend them. Do not redesign the ledger per project.

## What is provided

| File | What it is | How it was checked |
|---|---|---|
| `assets/ledger-schema.prisma` | The ledger (accounts, default accounts, periods, numbering, entries, lines) and around it: payment journals, tax codes, allocations, bank statements and reconciliation, the posting-request outbox, the fixed-asset register | `prisma validate` on Prisma 7 reports it valid. Not migrated to a database. |
| `assets/posting-core.mjs` | `buildEntry`, `validateEntry`, `reverseEntry`, `trialBalance`, `percentOf`, `toMinor`, `fromMinor`, and `EVENTS` (listed in `event-catalogue.md`) | `test/accounting.mjs` replays every event from a worked entry and checks every rejection rule |
| `assets/posting-service.mjs` | The service an ERP calls: `post`, `reverse`, `drainOutbox`, `outboxRow`; an in-memory repository and a MySQL one | Tested through the in-memory repository. The MySQL repository is not run against a database. |
| `assets/reports.mjs` | Income statement, balance sheet, indirect cash flow, open items with allocations, aging, dashboard KPIs, margin per `analytic_ref` | Tied to the E1-E19 tie-out of `close-and-statements.md` |
| `assets/period-close.mjs` | Year-end closing entries, opening balances, FX revaluation | Tied to E17-E19, E22 and C5 |
| `assets/inventory-valuation.mjs` | Moving average and FIFO cost per issue | Tied to I1 |
| `assets/seed-sql.mjs` | The setup SQL for a company: chart, default accounts, periods, numbering, payment journals | Output checked by the test; run the SQL yourself |
| `assets/coa-template-id.json` | Default chart, 29 accounts, with `cash_flow`, `pl` and `control` flags | Codes, types and normal balances checked |

The schema follows the naming already used in the owner's projects (`T_M_`
master tables, `T_L_` transaction tables, snake_case columns,
`Decimal(18, 2)` for money). Rename freely.

## The tables

- `T_M_ACC_ACCOUNT`: the chart. `account_type` and `normal_balance` drive
  behaviour; `control_type` marks an account fed by a subledger; `is_postable`
  is false for group accounts.
- `T_M_ACC_DEFAULT_ACCOUNT`: account determination. One row per role key
  (`receivable`, `sales`, `tax_output_ppn` and the rest listed in
  `posting-contract.md`) per company.
- `T_M_ACC_PERIOD`: periods with `open` or `closed`.
- `T_M_ACC_SEQUENCE`: the numbering counter, one row per company, journal and
  fiscal year.
- `T_L_ACC_JOURNAL_ENTRY`: the header, with `status`, the source document,
  the idempotency key and the maker and approver.
- `T_L_ACC_JOURNAL_LINE`: the lines, with functional-currency `debit` and
  `credit`, the transaction currency amount and rate, the party and the
  dimensions.

Add this by raw SQL in the first migration, because Prisma cannot declare it:

```sql
ALTER TABLE T_L_ACC_JOURNAL_LINE
  ADD CONSTRAINT ck_acc_line_one_side
  CHECK (debit >= 0 AND credit >= 0 AND debit * credit = 0 AND debit + credit > 0);
```

A row-level CHECK of this kind is what Odoo uses (`credit * debit = 0`). The
research did not confirm from which MySQL 8.0.x release CHECK is enforced or
how MariaDB behaves, so confirm on the project's server by inserting a row
that breaks it.

## What the database enforces and what the service must

| Rule | Where |
|---|---|
| Exact amounts | Database: `DECIMAL(18,2)` |
| A line is one side only | Database: the CHECK above |
| Lines belong to an entry and an existing account | Database: foreign keys |
| One posting per request | Database: unique `(company_id, idempotency_key)` |
| One number per journal | Database: unique `(company_id, journal_code, entry_number)` |
| Debits equal credits per entry | **Service**: `validateEntry`, inside the transaction |
| Period is open, account active and postable | **Service**: `validateEntry` |
| Maker differs from approver | **Service**: `validateEntry` |
| No gaps in numbers | **Service**: locked counter row in the transaction |
| Posted rows are never changed | **Service**: no UPDATE or DELETE path exists for posted entries; reversal only |

MariaDB/MySQL cannot enforce the balance rule with a constraint: a CHECK is
single-row and cannot contain a subquery (`real-systems-db-enforcement.md`).

## The posting transaction

One database transaction per posting request. The owner's projects run
queries through their own database layer and use Prisma for migrations, so
the steps are given as SQL.

```sql
START TRANSACTION;

-- 1. Idempotency. If a row exists, return that entry and stop.
SELECT entry_id, entry_number, status
  FROM T_L_ACC_JOURNAL_ENTRY
 WHERE company_id = ? AND idempotency_key = ?;

-- 2. Load what validateEntry needs: the accounts on the lines and the period.
--    Run buildEntry and validateEntry in the service. On any error: ROLLBACK.

-- 3. Take the next number. The row lock makes concurrent postings wait here.
SELECT next_number FROM T_M_ACC_SEQUENCE
 WHERE company_id = ? AND journal_code = ? AND fiscal_year = ?
   FOR UPDATE;
UPDATE T_M_ACC_SEQUENCE SET next_number = next_number + 1
 WHERE company_id = ? AND journal_code = ? AND fiscal_year = ?;

-- 4. Insert the header as posted, then the lines.
INSERT INTO T_L_ACC_JOURNAL_ENTRY (...) VALUES (...);
INSERT INTO T_L_ACC_JOURNAL_LINE (...) VALUES (...), (...);

-- 5. Re-check the balance from the stored rows. A non-zero result: ROLLBACK.
SELECT SUM(debit) - SUM(credit) FROM T_L_ACC_JOURNAL_LINE WHERE entry_id = ?;

COMMIT;
```

Notes that follow from the sources:

- The sequence row must exist before step 3; create it when the fiscal year
  is opened. If the transaction rolls back, the number is not consumed, which
  is what keeps the series without gaps.
- Two requests with the same idempotency key can both pass step 1. The unique
  index makes the second insert fail; catch that error and return the first
  entry.
- Pass amounts as strings to the driver and read them back as strings. Do not
  convert money to a JavaScript number at any point.
- Keep the transaction short. Do the reads and the validation first, and take
  the counter lock last.
- Run a scheduled job that checks `SUM(debit) = SUM(credit)` over all posted
  lines, and each subledger against its control account.

## Reversal

A posted entry is not edited. `reverseEntry` returns a new draft with debit
and credit swapped and a reference to the original. Post it through the same
transaction, then set the original's `status` to `reversed` and nothing else.
To correct an entry: reverse it, then post the right one. Both stay.

Every balance and report reads `posted` **and** `reversed` entries and leaves
out only drafts. A reversed entry is still in the ledger; its reversing entry
is what cancels it. Reading only `posted` drops the original and keeps the
reversal, which turns every reversed amount into its opposite.
`trialBalance` does this; a SQL report needs `WHERE status <> 'draft'`.

When the entry came from a module document (an invoice, a payment), reverse it
by cancelling the document: reverse every entry the document posted, mark the
document cancelled, and refuse while another open document refers to it (a
receipt against the invoice, depreciation of the asset). Reversing the entry
alone leaves the subledger open item behind and breaks rule 8.

## Connecting a module

A module calls the service with an event and amounts by role:

```js
buildEntry({
  event_type: "sale_invoice",
  idempotency_key: "INV-2026-000123:post",
  source_type: "sales_invoice", source_id: "123",
  posting_date: "2026-01-15", document_date: "2026-01-15", created_by: 7,
  amounts: { receivable: "105450000.00", sales: "95000000.00", tax_output_ppn: "10450000.00" },
}, defaults);
```

The module computes the business amounts (price, discount, tax) and never
names an account. `EVENTS` in `posting-core.mjs` decides the side of each
role, and the company's default accounts decide the account.

`EVENTS` covers every cycle with a worked entry: sales, purchasing, accruals,
cash, inventory and production, fixed assets, payroll, tax, and revenue over
time. The full list, with roles and the entry each reproduces, is
`event-catalogue.md`; the test keeps that list and the code in step.

A role left out of the request is skipped, so one event covers the sale with
and without PPN, and the payment with and without withholding.

**Several cash and bank accounts.** Keep one payment journal per account
(Kas, Bank BCA, Bank Mandiri), each with its own numbering. The user picks
the journal when registering a payment; the service passes that journal's
account for the role: `buildEntry(req, { ...defaults, bank: journal.account })`.
A transfer fills `bank_in` and `bank_out` the same way, and posts in the
journal of the account the money leaves. For `cash_receipt_other` and
`cash_payment_other` the user picks the `counterpart`; the service must
refuse a control account or another cash account there, because the entry
carries a source and `validateEntry` lets it through.

**Bank reconciliation** is a record beside the ledger, never an edit of it:
one row per matched line (entry number and line), the statement date and
balance per account. Matched lines summed equal the statement balance; the
book balance equals the statement plus deposits in transit minus payments not
yet cleared (worked entry C1). Every other
event in the catalogue in `posting-contract.md` (returns, advances, payroll,
imports, FX revaluation and the rest) is added the same way: take the worked
entry with that reference from the topic file, list its debit roles and
credit roles, add the role keys to the company's default accounts, and add a
test that replays the worked entry.

`percentOf(amount, num, den)` computes a tax amount exactly and rounds half
up: PPN on DPP nilai lain is `percentOf(dpp, 12n * 11n, 100n * 12n)`, PPh 23
is `percentOf(dpp, 2n, 100n)`. Read the numerator and denominator from the
effective-dated parameters, never from code. The rounding rule for PPN and
PPh was not settled by the research; confirm it before relying on it.

## A working consumer

`example/ledger/index.html` in the nito-skill repo is an accounting ERP built
on this starter, in one file: sales, purchases, register payment into a
chosen cash or bank account with fees and part payments, transfers, other
cash lines, bank reconciliation, fixed assets, depreciation, PPN settlement, tax payments, manual journals with
maker-checker approval, cancellation by reversal, period locks, the trial
balance, the general ledger and the two statements. It imports
`posting-core.mjs` unchanged and keeps its "database" in the browser, so the
document records, account determination, numbering counter and in-memory
transaction show the shape of the service a real ERP puts around the core.
`test/ledger.mjs` drives it in a browser.

## Not in the starter

- Running it against a database: the MySQL repository and the SQL have not
  been run during the research. `sql-checks.md` has what to run first.
- Payroll calculation (gross to net, TER, BPJS caps) and tax filing exports
  (Coretax, e-Bupot). The postings exist (`payroll_*`, tax events); the
  calculations and file formats are not built, and several payroll rates are
  unresolved in `values-to-verify.md`.
- Screens. For ledger and data-entry screens use the `nito-design` skill's
  dense-tool mode; `example/ledger/` shows them.
