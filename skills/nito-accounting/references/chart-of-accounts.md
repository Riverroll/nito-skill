# Chart of accounts

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## The chart of accounts is a data template keyed by type, not by number

No source opened prescribes a chart for private Indonesian companies; the government Bagan Akun Standar and sector charts (banks, insurers, koperasi, BUMN) were not researched. What is sourced is the generic convention: leading digit 1 assets, 2 liabilities, 3 equity, 4 revenue, 5 expenses, accounts listed in statement order, additional digits for larger companies, 6 onwards for merchandising and manufacturing ([OpenStax 3.2](https://openstax.org/books/principles-financial-accounting/pages/3-2-define-and-describe-the-expanded-accounting-equation-and-its-relationship-to-analyzing-transactions)). An Indonesian vendor example uses group codes ending in -000 (100-000 Aktiva, 200-000 Utang, 300-000 Modal, 500-000 HPP) ([Jurnal.id](https://www.jurnal.id/id/blog/chart-of-account-pengertian-manfaat-dan-macam-macam-kode-nya/), SECONDARY). The notes' illustrative chart (CONSTRUCTED; no source prescribes these codes) is summarised below and is intended as the skill's default template.

| Code | Account | Type / normal balance |
|---|---|---|
| 1-1100 / 1-1200 | Kas / Bank | Asset, Dr |
| 1-1300 | Piutang Usaha (control account, subledger by customer) | Asset, Dr |
| 1-1310 | Cadangan Kerugian Penurunan Nilai Piutang | Contra asset, Cr |
| 1-1400 | Piutang Pihak Berelasi / Antar Perusahaan | Asset, Dr |
| 1-1500 | Persediaan (control, by item and location) | Asset, Dr |
| 1-1700 / 1-1800 | PPN Masukan / Pajak Dibayar di Muka (PPh 22, 23, 25) | Asset, Dr |
| 1-2100 / 1-2190 | Aset Tetap by class / Akumulasi Penyusutan | Asset Dr / contra Cr |
| 1-9999 | Akun Penampung (suspense), zero at close | Dr or Cr |
| 2-1100 | Utang Usaha (control, by supplier) | Liability, Cr |
| 2-1200 / 2-1300 | Utang Gaji dan Beban Terutang / Pendapatan Diterima di Muka | Liability, Cr |
| 2-1400 / 2-1500 / 2-1510 | PPN Keluaran / Utang PPh 21 / Utang PPh 23, 4(2), 25, 29 | Liability, Cr |
| 3-1000 / 3-3000 / 3-3900 / 3-4000 | Modal Disetor / Laba Ditahan / Laba Tahun Berjalan / Dividen | Equity Cr (Dividen Dr) |
| 4-1000 / 4-1100 / 4-2000 | Penjualan / Retur dan Potongan / Pendapatan Jasa | Revenue Cr (4-1100 Dr) |
| 5-0000 / 6-0000 | HPP / Beban Operasional by nature | Expense, Dr |
| 7-0000 / 8-0000 | Pendapatan-Beban Lain (realised and unrealised FX kept separate) / Beban Pajak Penghasilan | Cr / Dr |
| 9-0000 | Ikhtisar Laba Rugi (closing, zero outside closing) | Temporary |

The following design rules are engineering guidance the notes mark UNVERIFIED as accounting rules, though they match what the compared ERPs do: use dimensions (cost centre, project, site, legal entity) on journal lines instead of multiplying accounts (ERPNext Accounting Dimensions add context "without creating new ledger accounts", [ERPNext](https://docs.frappe.io/erpnext/user/manual/en/accounting-dimensions)); block manual posting to subledger-controlled accounts; clear suspense accounts to zero before close; keep realised and unrealised FX in separate accounts because PP 94/2010 Pasal 9 gives exchange differences special tax treatment ([PP 94/2010](https://peraturan.go.id/files/pp94-2010bt.pdf), LAW; later amendment status not checked). Mapping each commercial account to the SPT Badan attachments (the Coretax version under PER-11/PJ/2025 reportedly has 14 attachment groups with Lampiran 1 split by sector) is UNVERIFIED because only a DDTC summary was seen ([DDTC](https://news.ddtc.co.id/literasi/kamus/1816321/apa-itu-spt-tahunan-pph-badan-dan-lampiran-lampirannya)).
