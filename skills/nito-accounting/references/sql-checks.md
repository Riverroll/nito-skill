# SQL checks for the ledger tables

> Part of the `nito-accounting` skill. Queries to run in DBeaver (or the
> project's SQL client) against the tables of `assets/ledger-schema.prisma`.
> Written for MariaDB/MySQL; **not run against a database during the
> research**. Replace `:company` with the company id.

## Once, after the first migration

The CHECK constraint must reject a line with both sides, and one with
neither. Run on a test database, inside a transaction you roll back:

```sql
START TRANSACTION;
-- expect an error naming ck_acc_line_one_side
INSERT INTO T_L_ACC_JOURNAL_LINE (entry_id, line_no, account_id, debit, credit)
VALUES ((SELECT MIN(entry_id) FROM T_L_ACC_JOURNAL_ENTRY), 999, (SELECT MIN(account_id) FROM T_M_ACC_ACCOUNT), 1, 1);
ROLLBACK;
```

If the insert succeeds, the server does not enforce the CHECK: the service
still refuses such a line (`validateEntry`), but the database is not a second
guard. A team note, not from the research: on MariaDB 10.4.19 an `ALTER
TABLE` on a table whose CHECK was read through an aliased query failed with
"Unknown column ... in CHECK"; `FLUSH TABLES <table>` before the ALTER cleared
it, and 10.4.20 fixed it.

## Daily

```sql
-- 1. every posted entry balances (expect no rows)
SELECT e.entry_number, SUM(l.debit) - SUM(l.credit) AS difference
  FROM T_L_ACC_JOURNAL_ENTRY e JOIN T_L_ACC_JOURNAL_LINE l ON l.entry_id = e.entry_id
 WHERE e.company_id = :company AND e.status <> 'draft'
 GROUP BY e.entry_id, e.entry_number HAVING difference <> 0;

-- 2. the trial balance balances (expect 0)
SELECT SUM(l.debit) - SUM(l.credit)
  FROM T_L_ACC_JOURNAL_LINE l JOIN T_L_ACC_JOURNAL_ENTRY e ON e.entry_id = l.entry_id
 WHERE e.company_id = :company AND e.status <> 'draft';

-- 3. allocations match lines on the same control account and party (expect no rows).
--    Open items per customer then add up to the control balance by construction.
SELECT a.allocation_id FROM T_L_ACC_ALLOCATION a
  JOIN T_L_ACC_JOURNAL_LINE d ON d.line_id = a.debit_line_id
  JOIN T_L_ACC_JOURNAL_LINE c ON c.line_id = a.credit_line_id
 WHERE a.undone_at IS NULL AND (d.account_id <> c.account_id OR NOT (d.party_id <=> c.party_id));

-- 3b. no line is allocated beyond its own amount (expect no rows)
SELECT l.line_id, l.debit, l.credit,
       (SELECT COALESCE(SUM(a.amount), 0) FROM T_L_ACC_ALLOCATION a
         WHERE a.undone_at IS NULL AND (a.debit_line_id = l.line_id OR a.credit_line_id = l.line_id)) AS allocated
  FROM T_L_ACC_JOURNAL_LINE l
 HAVING allocated > GREATEST(l.debit, l.credit);

-- 4. a line on a control account without a party (expect no rows)
SELECT e.entry_number, l.line_no FROM T_L_ACC_JOURNAL_LINE l
  JOIN T_L_ACC_JOURNAL_ENTRY e ON e.entry_id = l.entry_id
  JOIN T_M_ACC_ACCOUNT a ON a.account_id = l.account_id AND a.control_type IN ('customer', 'supplier')
 WHERE e.company_id = :company AND l.party_id IS NULL;

-- 5. GR/IR left open (the open receipts, to clear or explain)
SELECT l.party_id, SUM(l.credit - l.debit) AS open_amount FROM T_L_ACC_JOURNAL_LINE l
  JOIN T_L_ACC_JOURNAL_ENTRY e ON e.entry_id = l.entry_id
  JOIN T_M_ACC_DEFAULT_ACCOUNT d ON d.account_id = l.account_id AND d.company_id = e.company_id AND d.role_key = 'stock_received_not_billed'
 WHERE e.company_id = :company AND e.status <> 'draft' GROUP BY l.party_id HAVING open_amount <> 0;

-- 6. postings stuck in the outbox (expect no rows older than a day)
SELECT request_id, source_type, source_id, attempts, last_error, created_at
  FROM T_L_ACC_POSTING_REQUEST
 WHERE company_id = :company AND status <> 'posted' AND created_at < NOW() - INTERVAL 1 DAY;

-- 7. gaps in numbering (expect no rows)
SELECT journal_code, entry_number FROM (
  SELECT journal_code, entry_number,
         CAST(SUBSTRING_INDEX(entry_number, '/', -1) AS UNSIGNED) AS n,
         LAG(CAST(SUBSTRING_INDEX(entry_number, '/', -1) AS UNSIGNED)) OVER
           (PARTITION BY journal_code, SUBSTRING_INDEX(SUBSTRING_INDEX(entry_number, '/', 2), '/', -1) ORDER BY entry_id) AS prev
    FROM T_L_ACC_JOURNAL_ENTRY WHERE company_id = :company AND entry_number IS NOT NULL) t
 WHERE prev IS NOT NULL AND n <> prev + 1;
```

Query 7 needs window functions: MySQL 8.0 or MariaDB 10.2 and later.

## Dashboard as SQL, for a BI tool

```sql
-- revenue by month (credit-normal revenue less contra revenue)
SELECT DATE_FORMAT(e.posting_date, '%Y-%m') AS month, SUM(l.credit - l.debit) AS revenue
  FROM T_L_ACC_JOURNAL_LINE l
  JOIN T_L_ACC_JOURNAL_ENTRY e ON e.entry_id = l.entry_id AND e.status <> 'draft' AND COALESCE(e.source_type, '') <> 'year_end_close'
  JOIN T_M_ACC_ACCOUNT a ON a.account_id = l.account_id AND a.account_type IN ('revenue', 'contra_revenue')
 WHERE e.company_id = :company GROUP BY month ORDER BY month;

-- margin per voyage, shipment or project
SELECT l.analytic_ref, SUM(CASE WHEN a.account_type IN ('revenue','contra_revenue') THEN l.credit - l.debit ELSE 0 END) AS revenue,
       SUM(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END) AS costs
  FROM T_L_ACC_JOURNAL_LINE l
  JOIN T_L_ACC_JOURNAL_ENTRY e ON e.entry_id = l.entry_id AND e.status <> 'draft' AND COALESCE(e.source_type, '') <> 'year_end_close'
  JOIN T_M_ACC_ACCOUNT a ON a.account_id = l.account_id
 WHERE e.company_id = :company AND l.analytic_ref IS NOT NULL GROUP BY l.analytic_ref;
```

The same figures come from `assets/reports.mjs`, which is the tested version;
keep any SQL copy in step with it.
