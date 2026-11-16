# Inventory and COGS, fixed assets, cash and bank

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## Inventory, fixed assets, cash and bank

IAS 2 measures inventories at the lower of cost and net realisable value, using specific identification for non-interchangeable items and FIFO or weighted average for interchangeable items ([IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/), STANDARD, summary page; its LIFO prohibition is stated only in secondary summaries). For tax, PwC says inventories are measured at cost using average or FIFO consistently ([PwC](https://taxsummaries.pwc.com/indonesia/corporate/income-determination), SECONDARY), and DDTC/ortax snippets cite Pasal 10(6) UU PPh for the same limit, with a method change needing DGT approval, while the primary text of Pasal 10 was not opened, so a perpetual moving average satisfies both only on secondary evidence. Back-dated receipts or issues change the cost of every later issue under moving average, so the design inference is to block back-dating into closed periods and re-run cost within open periods; negative stock has no cost basis, so enforce or flag it. ERPNext's equivalent is Repost Item Valuation, which recalculates Stock Ledger Entries from the changed point and reposts GL entries ([ERPNext](https://docs.frappe.io/erpnext/user/manual/en/repost-item-valuation)).

| Ref | CONSTRUCTED inventory entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| I1 | Moving average: 100 units at 10,000, buy 50 at 12,000, sell 80 at average 10,666.67 | HPP 853,333 | Persediaan 853,333 | 853,333 |
| I1 | Buy 30 at 13,000 (average 11,366.67), sell 40 | HPP 454,667 | Persediaan 454,667 | 454,667 |
| I2 | NRV write-down, cost 50,000,000, NRV 42,000,000 | Beban Penurunan Nilai Persediaan 8,000,000 | Cadangan Penurunan Nilai 8,000,000 | 8,000,000 |
| I3 | Transfer dispatch, 100 units at 11,000 | Persediaan dalam Perjalanan 1,100,000 | Persediaan Gudang A 1,100,000 | 1,100,000 |
| I3 | Transfer receipt | Persediaan Gudang B 1,100,000 | Persediaan dalam Perjalanan 1,100,000 | 1,100,000 |
| I4 | Opname shortage 20 units at 5,000 | Beban Selisih Persediaan 100,000 | Persediaan 100,000 | 100,000 |
| I5 | Spares to maintenance cost centre | Beban Pemeliharaan 2,000,000 | Persediaan 2,000,000 | 2,000,000 |
| I6 | Materials to WIP | BDP 30,000,000 | Persediaan Bahan Baku 30,000,000 | 30,000,000 |
| I6 | Direct labour | BDP 20,000,000 | Utang Gaji dan Upah 20,000,000 | 20,000,000 |
| I6 | Overhead applied at 150% of labour | BDP 30,000,000 | Overhead Dibebankan 30,000,000 | 30,000,000 |
| I6 | Actual overhead | Overhead Sebenarnya 32,000,000 | Kas/Utang 32,000,000 | 32,000,000 |
| I6 | Finished goods transfer | Persediaan Barang Jadi 80,000,000 | BDP 80,000,000 | 80,000,000 |
| I6 | Close overhead (under-applied 2,000,000) | Overhead Dibebankan 30,000,000; HPP 2,000,000 | Overhead Sebenarnya 32,000,000 | 32,000,000 |
| I7 | Standard cost: 10,000 kg at 5,200 vs standard 5,000 (PPN ignored) | Persediaan 50,000,000; Selisih Harga Bahan 2,000,000 | Utang Usaha 52,000,000 | 52,000,000 |

The I1 FIFO comparison on the same first sale gives 800,000 against 853,333 under moving average, which shows why the method must be fixed and consistent. I3's PPN treatment of transfers between same-entity sites is UNVERIFIED, and the tax treatment of NRV write-downs was not verified (a candidate for fiscal correction under Pasal 9(1)(c)).

For fixed assets, book depreciation follows PSAK 216 (the entity sets life, method and residual), while tax depreciation under UU PPh Pasal 11 uses four groups with lives of 4, 8, 16 and 20 years (straight-line 25%, 12.5%, 6.25%, 5% or declining-balance 50%, 25%, 12.5%, 10%), buildings at 20 years (permanent) or 10 years (non-permanent), starting in the month of expenditure ([UU 36/2008](https://peraturan.go.id/files/uu36-2008bt.pdf), LAW). PMK 72/2023 replaced PMK-96/2009 and two others, kept the four groups, allowed permanent buildings to follow either 20 years or the actual life, and requires repair costs for assets over one year to be capitalised into fiscal net book value ([DJP SP-27/2023](https://www.pajak.go.id/sites/default/files/2023-08/SP-%2027%202023%20Penyusutan%20dan%20atau%20Amortisasi.pdf), GUIDANCE press release; the PMK body and its asset-to-group annex were **not opened**, and whether unlisted assets default to Kelompok 3 as under [PMK 96/2009](https://peraturan.bpk.go.id/Download/170792/PMK%20Nomor%2096%20Tahun%202009.pdf) is UNVERIFIED). IAS 16, IAS 38, IFRS 16 and IAS 12 are known only from the IFRS Foundation summary pages (IAS 36 impairment and the IAS 16 revaluation model were not opened, so implement them only after reading the standards). The design inference is two depreciation books per asset, commercial and fiscal, a construction-in-progress account whose completion date triggers fiscal depreciation, and a fiscal-versus-commercial difference schedule feeding deferred tax.

| Ref | CONSTRUCTED asset entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| F1 | Machine: price 120,000,000 + freight 3,000,000 + installation 5,000,000, PPN 14,080,000 | Aset Tetap Mesin 128,000,000; PPN Masukan 14,080,000 | Utang Usaha 142,080,000 | 142,080,000 |
| F2 | Year-1 book depreciation: (128,000,000 less 8,000,000 residual) / 5 | Beban Penyusutan 24,000,000 | Akumulasi Penyusutan 24,000,000 | 24,000,000 |
| F2 | Deferred tax: book 24,000,000 vs fiscal 16,000,000 (assumes Kelompok 2, UNVERIFIED), 8,000,000 x 22% | Aset Pajak Tangguhan 1,760,000 | Beban (Manfaat) Pajak Tangguhan 1,760,000 | 1,760,000 |
| F3 | Disposal: cost 128,000,000, accumulated 48,000,000, sold DPP 90,000,000 + PPN 9,900,000 | Bank 99,900,000; Akumulasi Penyusutan 48,000,000 | Aset Tetap Mesin 128,000,000; PPN Keluaran 9,900,000; Laba Pelepasan Aset 10,000,000 | 147,900,000 |
| F4 | Lease: 3 x 100,000,000 in arrears at an assumed 10%, PV 248,685,199 | Aset Hak-Guna 248,685,199 | Liabilitas Sewa 248,685,199 | 248,685,199 |
| F4 | Year-1 payment: interest 24,868,520, principal 75,131,480 | Beban Bunga 24,868,520; Liabilitas Sewa 75,131,480 | Bank 100,000,000 | 100,000,000 |
| F4 | Right-of-use depreciation over 3 years | Beban Penyusutan 82,895,066 | Akumulasi Penyusutan Aset Hak-Guna 82,895,066 | 82,895,066 |
| F5 | Impairment, carrying 80,000,000 vs recoverable 70,000,000 (IAS 36 text not opened) | Kerugian Penurunan Nilai 10,000,000 | Akumulasi Penurunan Nilai 10,000,000 | 10,000,000 |

Indonesian tax treatment of leases (PPh 23 on rent, finance-lease rules, deductibility of right-of-use depreciation) was not verified. A cash and bank subledger rests on an imprest petty-cash fund and monthly bank reconciliations whose reconciling items must sum so that adjusted bank equals adjusted book ([OpenStax 8.4](https://github.com/openstax/osbooks-principles-accounting-bundle/blob/main/modules/m67877/index.cnxml) and [8.6](https://github.com/openstax/osbooks-principles-accounting-bundle/blob/main/modules/m67879/index.cnxml), TEXTBOOK). Final tax on bank interest exists under Pasal 4(2) but its rate was not verified, and giro bilyet and cheque practice and kasbon tax treatment were not researched.

| Ref | CONSTRUCTED cash entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| C1 | Bank reconciliation: bank 168,000,000 + 20,000,000 deposits in transit - 35,000,000 outstanding = 153,000,000; book 150,000,000 + 250,000 + 2,900,000 - 150,000 = 153,000,000. Interest | Bank 250,000 | Pendapatan Bunga 250,000 | 250,000 |
| C1 | Unrecorded customer transfer | Bank 2,900,000 | Piutang Usaha 2,900,000 | 2,900,000 |
| C1 | Bank charges | Beban Administrasi Bank 150,000 | Bank 150,000 | 150,000 |
| C2 | Petty cash set-up | Kas Kecil 5,000,000 | Bank 5,000,000 | 5,000,000 |
| C2 | Replenishment: 1,500,000 + 2,000,000 + 700,000 | Beban Transportasi 1,500,000; Beban Perlengkapan 2,000,000; Beban Konsumsi 700,000 | Bank 4,200,000 | 4,200,000 |
| C3 | Employee advance (kasbon) | Uang Muka Karyawan 10,000,000 | Kas/Bank 10,000,000 | 10,000,000 |
| C3 | Settlement: expense 8,500,000, refund 1,500,000 | Beban Perjalanan Dinas 8,500,000; Kas 1,500,000 | Uang Muka Karyawan 10,000,000 | 10,000,000 |
| C4 | Gateway sale, DPP 1,000,000, PPN 110,000 | Piutang Gateway 1,110,000 | Penjualan 1,000,000; PPN Keluaran 110,000 | 1,110,000 |
| C4 | Settlement net of 2% fee (PPN on fee not modelled) | Bank 1,087,800; Beban Biaya Gateway 22,200 | Piutang Gateway 1,110,000 | 1,110,000 |
| C5 | USD 10,000 bank balance, 15,500 to 15,800 (invented) | Bank USD 3,000,000 | Keuntungan Selisih Kurs 3,000,000 | 3,000,000 |
