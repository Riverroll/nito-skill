# Journals, general ledger and worked entries

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## Journals, posting, adjusting, closing and correcting, with balanced worked entries

Journal anatomy is: date, debit lines first, credit lines after, a description and a reference to an original source document; posting moves the lines to the general ledger, and the cycle runs identify, journal, post, unadjusted trial balance, adjusting entries, adjusted trial balance, statements, closing entries, post-closing trial balance and optional reversing entries ([OpenStax 3.3/3.5](https://openstax.org/books/principles-financial-accounting/pages/3-5-use-journal-entries-to-record-transactions-and-post-to-t-accounts); [OpenStax 5.1](https://openstax.org/books/principles-financial-accounting/pages/5-1-describe-and-prepare-closing-entries-for-a-business)). Companies using special journals (sales, purchases, cash receipts, cash disbursements) post monthly totals to the general ledger while subsidiary ledgers hold per-customer and per-supplier detail ([OpenStax 7.2](https://openstax.org/books/principles-financial-accounting/pages/7-2-describe-and-explain-the-purpose-of-special-journals-and-their-importance-to-stakeholders)); the notes did not confirm the phrase "control account" in the text and inferred the concept. Adjusting entries pair one income-statement account with one balance-sheet account and never touch cash ([OpenStax 4.3](https://openstax.org/books/principles-financial-accounting/pages/4-3-record-and-post-the-common-types-of-adjusting-entries)). Closing moves revenue, expenses and dividends to retained earnings through an Income Summary, and the post-closing trial balance must show only permanent accounts ([OpenStax 5.1](https://openstax.org/books/principles-financial-accounting/pages/5-1-describe-and-prepare-closing-entries-for-a-business)). Corrections of material prior-period errors are restated retrospectively (IAS 8.41-42, [IAS 8](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias8.html), STANDARD); IAS 8 governs statements, and "never edit a posted entry" is an internal-control principle, not a stated legal rule.

The notes' January 2026 sequence for "PT Contoh Dagang" is reproduced below. **All entries are CONSTRUCTED ILLUSTRATIONS: amounts are invented, rules are sourced, no VAT or income tax is included, and every entry balances.** The depreciation life (48 months) and the 2% allowance are invented; PSAK 216 and PSAK 109 govern real policies.

| Ref | Scenario and rule | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| E1 | Share capital paid in | Bank 500,000,000 | Modal Disetor 500,000,000 | 500,000,000 |
| E2 | Equipment for cash | Peralatan Kantor 24,000,000 | Bank 24,000,000 | 24,000,000 |
| E3 | Inventory on credit | Persediaan 100,000,000 | Utang Usaha 100,000,000 | 100,000,000 |
| E4 | Credit sale (perpetual) | Piutang Usaha 80,000,000 | Penjualan 80,000,000 | 80,000,000 |
| E5 | Cost of that sale | HPP 50,000,000 | Persediaan 50,000,000 | 50,000,000 |
| E6 | Collect receivable | Bank 30,000,000 | Piutang Usaha 30,000,000 | 30,000,000 |
| E7 | Pay supplier | Utang Usaha 40,000,000 | Bank 40,000,000 | 40,000,000 |
| E8 | 12 months rent in advance | Sewa Dibayar di Muka 12,000,000 | Bank 12,000,000 | 12,000,000 |
| E9 | Customer deposit (liability) | Bank 5,000,000 | Pendapatan Diterima di Muka 5,000,000 | 5,000,000 |
| E10 | Salaries paid | Beban Gaji 15,000,000 | Bank 15,000,000 | 15,000,000 |

The unadjusted trial balance after E1-E10 totals 645,000,000 on each side (Bank 444,000,000 Dr; Piutang 50,000,000; Persediaan 50,000,000; prepaid rent 12,000,000; equipment 24,000,000; HPP 50,000,000; salaries 15,000,000; Utang Usaha 60,000,000 Cr; unearned revenue 5,000,000; capital 500,000,000; sales 80,000,000).

| Ref | Adjusting entry at 31 Jan 2026 | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| E11 | Rent for the month (12,000,000 / 12) | Beban Sewa 1,000,000 | Sewa Dibayar di Muka 1,000,000 | 1,000,000 |
| E12 | Depreciation (24,000,000 / 48 months) | Beban Penyusutan 500,000 | Akumulasi Penyusutan 500,000 | 500,000 |
| E13 | Accrued salaries | Beban Gaji 3,000,000 | Utang Gaji 3,000,000 | 3,000,000 |
| E14 | Part of deposit earned | Pendapatan Diterima di Muka 2,000,000 | Pendapatan Jasa 2,000,000 | 2,000,000 |
| E15 | Allowance, 2% of 50,000,000 (invented rate) | Beban Kerugian Piutang 1,000,000 | Cadangan Kerugian 1,000,000 | 1,000,000 |
| E16 | Count shortage | Beban Selisih Persediaan 500,000 | Persediaan 500,000 | 500,000 |
| E17 | Close revenue | Penjualan 80,000,000; Pendapatan Jasa 2,000,000 | Ikhtisar Laba Rugi 82,000,000 | 82,000,000 |
| E18 | Close expenses (50,000,000 + 18,000,000 + 1,000,000 + 500,000 + 1,000,000 + 500,000) | Ikhtisar Laba Rugi 71,000,000 | the six expense accounts, 71,000,000 | 71,000,000 |
| E19 | Net income to retained earnings | Ikhtisar Laba Rugi 11,000,000 | Laba Ditahan 11,000,000 | 11,000,000 |

The adjusted trial balance totals 649,500,000 each side, and the post-closing trial balance totals 578,500,000 each side with only permanent accounts (Bank 444,000,000; Piutang 50,000,000; Persediaan 49,500,000; prepaid rent 11,000,000; equipment 24,000,000 against allowance 1,000,000, accumulated depreciation 500,000, Utang Usaha 60,000,000, Utang Gaji 3,000,000, unearned revenue 3,000,000, capital 500,000,000, Laba Ditahan 11,000,000). The Ikhtisar balance before E19 (82,000,000 less 71,000,000 = 11,000,000) equals reported net profit, as OpenStax 5.1 requires.

| Ref | Special entry (all CONSTRUCTED) | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| E17b | Reverse E13 on 1 Feb (optional) | Utang Gaji 3,000,000 | Beban Gaji 3,000,000 | 3,000,000 |
| E17b | Pay full salary on 5 Feb | Beban Gaji 20,000,000 | Bank 20,000,000 | 20,000,000 |
| E21 | Correct a capital item expensed in error: reversal | Bank 4,000,000 | Beban Perlengkapan 4,000,000 | 4,000,000 |
| E21 | Correct: re-post | Peralatan Kantor 4,000,000 | Bank 4,000,000 | 4,000,000 |
| E22 | Opening balances from a legacy system | Bank 100,000,000; Piutang 50,000,000; Persediaan 70,000,000; Peralatan 80,000,000 | Utang Usaha 60,000,000; Modal Disetor 150,000,000; Laba Ditahan 90,000,000 | 300,000,000 |
| E20 | VAT at an ILLUSTRATIVE, UNVERIFIED 11%: purchase | Persediaan 100,000,000; PPN Masukan 11,000,000 | Utang Usaha 111,000,000 | 111,000,000 |
| E20 | VAT at an ILLUSTRATIVE 11%: sale | Piutang Usaha 88,800,000 | Penjualan 80,000,000; PPN Keluaran 8,800,000 | 88,800,000 |

In E17b the net February salary expense is 17,000,000, so January's 3,000,000 is not counted twice; E21 leaves both the wrong entry and its fix in the ledger (Fowler's Reversal Adjustment, [Fowler](https://martinfowler.com/eaaDev/ReversalAdjustment.html)); E22's subledger balances must sum to their control accounts, and any temporary "Saldo Awal" clearing account must end at zero.
