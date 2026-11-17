# AR, AP and PPN

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## Order-to-cash, procure-to-pay and the PPN overlay

AR is the customer subledger whose total must equal the control account Piutang Usaha, and revenue follows the five-step IFRS 15 model (identify the contract and obligations, determine and allocate the price, recognise revenue when control transfers) ([IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/), STANDARD, summary page only; paragraph references such as IFRS 15 para 35 are UNVERIFIED). The notes' central design rule, an inference, is to keep three dates on every sale: delivery or control transfer (revenue, COGS, stock out), Faktur Pajak (PPN Keluaran) and cash. Faktur Pajak is issued at delivery, at receipt of an advance, at each instalment, or at export, and advance receipts in one month can be combined into a "Faktur Pajak Gabungan" ([DJP](https://pajak.go.id/index.php/id/artikel/cara-membuat-faktur-pajak-uang-muka-dan-pelunasan-di-coretax-djp), GUIDANCE, citing PER-11/PJ/2025 Pasal 31-32; DJP does not give the offset arithmetic, so the final-invoice example follows common practice and is an inference). Customers that are withholding agents deduct PPh 23, so a receipt short by 2% of the DPP is the normal signature, and the bukti potong is a prepaid-tax asset rather than a revenue reduction (inference).

The tax treatment of credit losses matters for the ledger: a bad debt is deductible only if expensed in the commercial accounts, listed to DJP, and supported by one of the court, agreement, publication or debtor-acknowledgement conditions (UU PPh Pasal 6(1)(h) as amended by UU 7/2021, [UU 7/2021](https://peraturan.go.id/files/uu7-2021bt.pdf), LAW); reserve funds are not deductible except listed ones (Pasal 9(1)(c)), so an expected-credit-loss allowance of an ordinary trading company is a positive fiscal correction and a temporary difference. The implementing PMK 105/2009 and its threshold are UNVERIFIED (snippets only).

On the purchase side, AP is the supplier subledger tied to Utang Usaha with a three-way match feeding a goods-received-not-invoiced account. The three-way-match tolerances have no regulatory source and must be policy parameters. PPN Masukan is credited against output of the same period (Pasal 9(2)), is not creditable when there is no direct business link or the Faktur Pajak is defective (Pasal 9(8)b, 9(8)f), may be credited up to three Masa Pajak later if not expensed or capitalised (Pasal 9(9)), and excess input carries forward or is refunded in defined cases (Pasal 9(4), 9(4a), 9(4b)) ([UU 7/2021](https://peraturan.go.id/files/uu7-2021bt.pdf)). Withholding on vendor payments is PPh 23 (2% on services and rent of assets other than land and buildings; 15% on dividends, interest, royalties and prizes; 100% higher without NPWP, [UU 36/2008](https://peraturan.go.id/files/uu36-2008bt.pdf), the 2008 text with later amendments unchecked for this article), final PPh 4(2) on building rent and construction, PPh 26 on non-residents, and PPh 22 on imports. The construction final rates (1.75%, 2.65%, 4%; consulting 3.5%, 6%; integrated 2.65%, 4%) are mapped in a DJP deck citing PP 51/2008 as amended by PP 9/2022 ([DJP deck](https://pajak.go.id/sites/default/files/2026-07/Aspek%20Perpajakan%20Usaha%20Jasa%20Konstruksi.pdf), GUIDANCE).

| Ref | CONSTRUCTED AR entry (PPN shown as 12% x 11/12 = 11% effective) | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| A1 | Sale, 5% trade discount, DPP 95,000,000, PPN 10,450,000 | Piutang Usaha 105,450,000 | Penjualan 95,000,000; PPN Keluaran 10,450,000 | 105,450,000 |
| A1 | Cost of that sale | HPP 60,000,000 | Persediaan 60,000,000 | 60,000,000 |
| A2 | Service invoice, DPP 50,000,000, PPN 5,500,000 | Piutang Usaha 55,500,000 | Pendapatan Jasa 50,000,000; PPN Keluaran 5,500,000 | 55,500,000 |
| A2 | Receipt net of PPh 23 at 2% (base excluding PPN is UNVERIFIED) | Bank 54,500,000; PPh 23 Dibayar di Muka 1,000,000 | Piutang Usaha 55,500,000 | 55,500,000 |
| A3 | Advance, DPP 30,000,000, PPN 3,300,000 | Bank 33,300,000 | Uang Muka Pelanggan 30,000,000; PPN Keluaran 3,300,000 | 33,300,000 |
| A3 | Final invoice, DPP 100,000,000, total PPN 11,000,000 | Uang Muka Pelanggan 30,000,000; Piutang Usaha 77,700,000 | Penjualan 100,000,000; PPN Keluaran 7,700,000 | 107,700,000 |
| A4 | Return, DPP 10,000,000, PPN 1,100,000 (nota retur rules UNVERIFIED) | Retur Penjualan 10,000,000; PPN Keluaran 1,100,000 | Piutang Usaha 11,100,000 | 11,100,000 |
| A4 | Stock back at cost 6,000,000 | Persediaan 6,000,000 | HPP 6,000,000 | 6,000,000 |
| A5 | ECL matrix: 250,000 + 400,000 + 500,000 + 750,000 + 1,200,000 (loss rates invented) | Beban Kerugian Kredit 3,100,000 | Cadangan Kerugian 3,100,000 | 3,100,000 |
| A5 | Deferred tax at 22% on the non-deductible allowance | Aset Pajak Tangguhan 682,000 | Beban (Manfaat) Pajak Tangguhan 682,000 | 682,000 |
| A6 | Write-off of a specific debtor (PPN effect UNVERIFIED) | Cadangan Kerugian 2,000,000 | Piutang Usaha 2,000,000 | 2,000,000 |

| Ref | CONSTRUCTED AP entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| P1 | Goods receipt, DPP 80,000,000 | Persediaan 80,000,000 | GR/IR 80,000,000 | 80,000,000 |
| P1 | Matching vendor invoice, PPN 8,800,000 | GR/IR 80,000,000; PPN Masukan 8,800,000 | Utang Usaha 88,800,000 | 88,800,000 |
| P1 | Payment | Utang Usaha 88,800,000 | Bank 88,800,000 | 88,800,000 |
| P2 | Service invoice, DPP 40,000,000, PPN 4,400,000 | Beban Jasa 40,000,000; PPN Masukan 4,400,000 | Utang Usaha 44,400,000 | 44,400,000 |
| P2 | Payment net of PPh 23 2% = 800,000 | Utang Usaha 44,400,000 | Bank 43,600,000; Utang PPh 23 800,000 | 44,400,000 |
| P2 | Remit by the 15th | Utang PPh 23 800,000 | Bank 800,000 | 800,000 |
| P3 | Building rent 100,000,000, PPN 11,000,000; final PPh 4(2) 10% | Beban Sewa 100,000,000; PPN Masukan 11,000,000 | Utang Usaha 111,000,000 | 111,000,000 |
| P3 | Payment | Utang Usaha 111,000,000 | Bank 101,000,000; Utang PPh Final 4(2) 10,000,000 | 111,000,000 |
| P4 | Non-creditable input PPN (DPP 10,000,000, PPN 1,100,000) | Beban 11,100,000 | Utang Usaha 11,100,000 | 11,100,000 |
| P5 | Import: CIF 50,000,000, duty 5% (assumed), PPN impor on 52,500,000, PPh 22 at 2.5% (UNVERIFIED base and rate) | Persediaan 52,500,000; PPN Masukan 5,775,000; PPh 22 Dibayar di Muka 1,312,500 | Utang Usaha 50,000,000; Bank 9,587,500 | 59,587,500 |
| P6 | Purchase return, DPP 10,000,000, PPN 1,100,000 | Utang Usaha 11,100,000 | Persediaan 10,000,000; PPN Masukan 1,100,000 | 11,100,000 |
| P7 | Vendor prepayment, DPP 20,000,000, PPN 2,200,000 | Uang Muka Pembelian 20,000,000; PPN Masukan 2,200,000 | Bank 22,200,000 | 22,200,000 |
| P7 | Final service invoice, DPP 40,000,000, total PPN 4,400,000, the advance deducted | Beban Jasa 40,000,000; PPN Masukan 2,200,000 | Uang Muka Pembelian 20,000,000; Utang Usaha 22,200,000 | 42,200,000 |
| P8 | Period-end accrual, services not invoiced | Beban Jasa 20,000,000 | Biaya yang Masih Harus Dibayar 20,000,000 | 20,000,000 |
| P9 | Non-resident fee 100,000,000: PPh 26 at 20%, self-assessed PPN 11,000,000 (no treaty, no PMSE collector) | Beban Jasa 100,000,000; PPN Masukan (JLN) 11,000,000 | Bank 80,000,000; Utang PPh 26 20,000,000; Utang PPN JLN 11,000,000 | 111,000,000 |

PPN itself is a statutory 12% under UU HPP Pasal 7(1)b ("not later than 1 January 2025"), adjustable between 5% and 15% by Government Regulation, with 0% on exports and a DPP that may be "nilai lain" ([UU 7/2021](https://peraturan.go.id/files/uu7-2021bt.pdf), LAW). PMK 131/2024, in force 1 January 2025, sets the DPP nilai lain at 11/12 of the price so the effective rate is 11% for most goods and services, while luxury (PPnBM) goods are taxed at 12% on the full price ([JDIH abstract](https://jdih.kemenkeu.go.id/download/b6655071-d62e-4733-a9e2-72a8b4d233cd/131%20Tahun%202024.pdf), LAW abstract only; [DJP article](https://www.pajak.go.id/id/node/113453), the author's personal opinion). PMK 11/2025 (in force 4 February 2025) amended fifteen related PMKs retroactive to 1 January 2025 ([DDTC](https://news.ddtc.co.id/pmk-omnibus-terbit-revisi-aturan-dpp-nilai-lain-ppn-besaran-tertentu-1808691), SECONDARY). Mid-2026 documents still compute 12% x 11/12, for example the PMK 24/2026 attachment's Rp100,276 on a Rp911,600 airline fare ([PMK 24/2026 attachment](https://www.pajak.go.id/sites/default/files/lampiran/Lampiran%20PMK%2024%20Tahun%202026.pdf)). No source opened shows the effective rate changing, but search results were weighted to 2025 and early 2026, so a change after June 2026 is not excluded. The design inferences are: store DPP, a nilai-lain flag, rate, transaction code (04 nilai lain, 01 luxury per a DDTC snippet, [DDTC](https://news.ddtc.co.id/berita/nasional/1811127/per-11pj2025-pertegas-ketentuan-kode-dan-nomor-seri-faktur-pajak), SECONDARY), the 17-digit NSFP (SECONDARY, format unverified), Faktur date, Masa Pajak, a creditable flag per line and a "credit-by" Masa Pajak; select the tax rate per line from an effective-dated table; keep accounts for PPN Keluaran, PPN Masukan, non-creditable input and PPN Lebih Bayar.

| Ref | CONSTRUCTED PPN settlement | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| V2 | Output 125,000,000, creditable input 98,000,000 | PPN Keluaran 125,000,000 | PPN Masukan 98,000,000; Utang PPN 27,000,000 | 125,000,000 |
| V2 | Pay before filing | Utang PPN 27,000,000 | Bank 27,000,000 | 27,000,000 |
| V3 | Output 60,000,000, input 85,000,000 (carry forward) | PPN Keluaran 60,000,000; PPN Lebih Bayar 25,000,000 | PPN Masukan 85,000,000 | 85,000,000 |
