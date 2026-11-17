# Voyage and shipping

> Part of the `nito-accounting` skill. Researched 17 November 2026. Sources
> are SECONDARY unless marked: Big Four and BDO shipping guides, a shipping
> company's annual report, DDTC and klikpajak tax articles. No IFRS paragraph
> text and no KMK or PP text was opened. VY1-VY6 are CONSTRUCTED (amounts
> invented). Confirm every tax rate and every PPN treatment before use
> (`../values-to-verify.md`).

A voyage module owns vessels, voyages, cargo, laytime and bunker reports. The
ledger gets revenue as the voyage progresses, the costs of the voyage tagged
to it, and the tax that shipping attracts. `analytic_ref` carries the voyage
number on every line, so `reports.mjs` `byAnalytic` gives a P&L per voyage.

## The contract decides the accounting

| Contract | What the owner sells | Revenue | Main costs on the owner |
|---|---|---|---|
| Voyage charter, contract of affreightment, spot freight | Carriage of cargo from A to B | Freight, over the voyage (IFRS 15) | Bunkers, port, canal, agency, plus running costs |
| Time charter | The vessel and crew for a period | Hire; a lease component (IFRS 16) and a service component | Running costs; the charterer pays bunkers and port |
| Bareboat charter | The vessel only | Lease income (IFRS 16) | Depreciation; the charterer runs the ship |

Time charters typically contain a lease (the right to use the ship) and a
service component (operation and crew); IFRS 16 did not change lessor
accounting ([PwC, IFRS 16 and shipping](https://www.pwc.com/gr/en/publications/assets/ifrs-16-leases-implications-for-the-shipping-industry.pdf), SECONDARY).
Splitting hire between the two needs a policy; the allocation basis in the
final standard was not read here (UNVERIFIED).

## Revenue on a voyage

- **Over time, load to discharge.** Shipping companies recognise voyage
  freight over the voyage; load-to-discharge is common since IFRS 15, where
  discharge-to-discharge and load-to-load were used before. Hafnia's 2022
  report recognises freight "evenly over the period from the point of loading
  of the current voyage to the point of discharge"
  ([Hafnia annual report 2022](https://annualreport2022.hafnia.com/financial-statements/notes-to-the-consolidated-financial-statements/), SECONDARY as one company's policy;
  [BDO, IFRS 15 issues in shipping](https://www.bdo.co.uk/getmedia/891ce9e0-f2a4-4063-be46-c9eb415a940d/IFRS15-Accounting-issues-in-shipping.pdf.aspx), SECONDARY).
  Practice is not uniform: some auditors do not allow revenue during the
  ballast leg to the load port, and the measure of progress may be days or
  cost (KPMG notes diversity, SECONDARY). **Make the method a company
  setting**, default load-to-discharge by days.
- **Demurrage is variable consideration.** Include it only when it is highly
  probable it will not reverse, measured on the laytime statement
  (BDO, SECONDARY; IFRS 15 constraint paragraphs not opened, UNVERIFIED).
- **Ballast and positioning costs** may be deferred as costs to fulfil the
  next contract and released over it (BDO, SECONDARY; policy choice).
- **Freight billed ahead** (freight prepaid on the bill of lading) is a
  contract liability until earned.

## Costs of a voyage

| Cost | Treatment | Event |
|---|---|---|
| Bunkers bought | Inventory while on board (IAS 2 by general principle; no shipping-specific source opened, design inference) | `vendor_invoice` or `goods_receipt` to `bunker_inventory` |
| Bunkers burned | Voyage expense from the noon or bunker report, at valuation cost | `bunker_consumption` |
| Port, pilotage, towage, agency, canal | Voyage expense, tagged with the voyage | `vendor_service_invoice` with `analytic_ref` |
| Crew, insurance, maintenance | Vessel running cost; tag the vessel, allocate to voyages if the company wants voyage net results | `accrual`, `vendor_service_invoice`, payroll events |
| Vessel | Fixed asset, depreciated; dry-docking often a separate component (policy) | `asset_acquisition`, `depreciation` |

## Indonesian tax on shipping

| Item | Rule found | Source and status |
|---|---|---|
| PPh 15, domestic shipping company | Final, 1.2% of gross revenue (4% deemed net x 30%), KMK 416/KMK.04/1996, SE-29/PJ.4/1996 | [DDTC](https://news.ddtc.co.id/berita/nasional/1822683/hari-maritim-nasional-bagaimana-perlakuan-pajak-atas-jasa-pelayaran), [klikpajak](https://klikpajak.id/blog/cara-menghitung-pph-pasal-15-sesuai-uu-pajak-penghasilan/), SECONDARY; KMK text not opened |
| PPh 15, foreign shipping company with a permanent establishment | 2.64% of gross revenue, KMK 417/KMK.04/1996 | DDTC, SECONDARY |
| Who pays PPh 15 | A charterer that is a withholding agent cuts 1.2% and issues a final bukti potong; otherwise the shipping company pays it itself by the 15th of the next month | [DDTC](https://news.ddtc.co.id/berita/nasional/1811864/begini-ketentuan-pemotongan-pajak-atas-jasa-pelayaran-dalam-negeri), [pajak.com](https://www.pajak.com/pajak/simak-ketentuan-pph-15-bagi-perusahaan-pelayaran-dalam-negeri/), SECONDARY |
| Base of the 1.2% | Gross revenue; whether PPN is excluded was not confirmed | UNVERIFIED |
| PPN, public transport by sea | Exempt: PP 49/2022 Pasal 10 huruf h, defined in Pasal 20 ayat (2), no SKB needed (Pasal 24) | [DDTC consultation](https://news.ddtc.co.id/review/konsultasi/44243/jasa-angkutan-umum-laut-bebas-ppn-bagaimana-aturan-faktur-pajaknya), SECONDARY |
| PPN, carriage under a charter | Not covered by the exemption: Pasal 20 ayat (5) excludes transport under a charter or hire agreement | DDTC, SECONDARY |
| PPN, vessels and certain port services for national shipping companies | Not collected (tidak dipungut) on application, e-SKTD | DDTC, muc.co.id, SECONDARY; article numbers not confirmed |

PPh 15 is a final tax: it is not creditable against corporate income tax, so
the amount cut by a charterer is an expense of the period, not prepaid tax.
When the company pays it itself, post `final_tax` at month end and
`tax_payment` when paid.

## The worked entries

Voyage 2026-014, coal, domestic, under a voyage charter: freight
500,000,000, loaded 27 January, discharged 5 February (10 days, 5 in
January). PPN is shown because carriage under a charter is outside the
exemption; check the contract and current rules.

| Ref | CONSTRUCTED entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| VY1 | Freight invoiced at loading, DPP 500,000,000, PPN 55,000,000 (12% x 11/12) | Piutang Usaha 555,000,000 | Pendapatan Diterima di Muka 500,000,000; PPN Keluaran 55,000,000 | 555,000,000 |
| VY2 | 31 January: 5 of 10 days done | Pendapatan Diterima di Muka 250,000,000 | Pendapatan Freight 250,000,000 | 250,000,000 |
| VY2 | 5 February: discharged | Pendapatan Diterima di Muka 250,000,000 | Pendapatan Freight 250,000,000 | 250,000,000 |
| VY3 | Demurrage, 2 days at 15,000,000, highly probable on the laytime statement | Aset Kontrak 30,000,000 | Pendapatan Demurrage 30,000,000 | 30,000,000 |
| VY3 | Demurrage invoiced, PPN 3,300,000 | Piutang Usaha 33,300,000 | Aset Kontrak 30,000,000; PPN Keluaran 3,300,000 | 33,300,000 |
| VY4 | Bunkers burned, 40 MT at 11,000,000 average | Beban Bunker 440,000,000 | Persediaan Bahan Bakar Kapal 440,000,000 | 440,000,000 |
| VY5 | Charterer pays, cutting PPh 15 at 1.2% of 500,000,000 | Bank 549,000,000; Beban PPh Final 6,000,000 | Piutang Usaha 555,000,000 | 555,000,000 |
| VY6 | Port and agency costs at the discharge port (PPN facility not assumed) | Beban Pelabuhan 25,000,000 | Utang Usaha 25,000,000 | 25,000,000 |

Voyage result with `byAnalytic`: freight 500,000,000 + demurrage 30,000,000
less bunkers 440,000,000, port 25,000,000 and PPh 15 6,000,000 = 59,000,000
before running costs.

## What the voyage module sends

| Voyage step | Event | Notes |
|---|---|---|
| Fixture, nomination, voyage estimate | none | |
| Bill of lading, freight invoice | `advance_billing` | key `voyage:{no}:freight:v1` |
| Month end during the voyage | `revenue_over_time` (`earned_revenue` to the freight account) | share by days load to discharge; if not yet invoiced, debit `contract_asset` |
| Laytime statement shows demurrage | `demurrage_claim`, later `demurrage_invoice` | despatch owed to the charterer is the reverse, a reduction of revenue |
| Bunker report | `bunker_consumption` | cost from `inventory-valuation.mjs` per vessel |
| Port, agency, canal invoices | `vendor_service_invoice` with `analytic_ref` | |
| Receipt from the charterer | `receipt_in` with `final_tax_expense` for PPh 15 cut | |
| Voyage closed | nothing posts; `byAnalytic` gives the result | |

Freight in USD: post the lines with `currency_code`, `amount_currency` and
`exchange_rate`, the IDR amount in debit or credit, and revalue open USD
receivables at month end (`period-close.mjs` `fxRevaluation`,
`../multi-currency.md`).
