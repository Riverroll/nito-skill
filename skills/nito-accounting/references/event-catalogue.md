# Event catalogue

> Part of the `nito-accounting` skill. This table is checked against
> `assets/posting-core.mjs` by `test/accounting.mjs`: every event the code has
> is listed here with the same roles and the worked entry it reproduces, and
> nothing else is. Worked entries are constructed illustrations (amounts
> invented, rules sourced); the reference after each event says where.

A module never names an account and never names a side. It picks an event,
sends the amounts by role, and the company's account determination chooses
the accounts. A role left out is skipped, so `sale_invoice` without
`tax_output_ppn` is a sale by a company that is not PKP.

## Events

| Event | When the module sends it | Debit roles | Credit roles | Worked entry |
|---|---|---|---|---|
| `sale_invoice` | Goods invoiced or control transferred; deduct an advance already received | `receivable`, `customer_advance` | `sales`, `tax_output_ppn` | A1, A3 |
| `sale_cogs` | Goods leave stock for a sale (amount from inventory-valuation.mjs) | `cogs` | `inventory` | A1 |
| `service_invoice` | A service invoiced (CRM, project, freight agency, consulting) | `receivable`, `customer_advance` | `service_revenue`, `tax_output_ppn` | A2 |
| `customer_advance` | A down payment or deposit received before delivery | `bank` | `customer_advance`, `tax_output_ppn` | A3, E9 |
| `advance_earned` | Part of a deposit earned without an invoice (subscription, prepaid service) | `customer_advance` | `service_revenue` | E14 |
| `sale_return` | Credit note for goods returned or a price reduction | `sales_return`, `tax_output_ppn` | `receivable` | A4 |
| `sale_return_cost` | Returned goods back into stock at their cost | `inventory` | `cogs` | A4 |
| `receipt_in` | Customer pays; PPh 23 or final tax cut by the customer; bank fee deducted | `bank`, `prepaid_tax_22_23_25`, `final_tax_expense`, `bank_charges` | `receivable` | A2, C4 |
| `credit_loss_provision` | Month or year end: expected credit loss on receivables | `credit_loss_expense` | `credit_loss_allowance` | A5, E15 |
| `receivable_write_off` | A specific debt judged uncollectable | `credit_loss_allowance` | `receivable` | A6 |
| `goods_receipt` | Goods received against a purchase order (GR/IR) | `inventory` | `stock_received_not_billed` | P1 |
| `vendor_invoice` | Supplier invoice matched to a goods receipt; deduct a down payment already made | `stock_received_not_billed`, `tax_input_ppn` | `payable`, `vendor_advance` | P1, P7 |
| `vendor_service_invoice` | Supplier invoice for a service or expense; non-creditable PPN goes into the expense; deduct a down payment already made | `service_expense`, `tax_input_ppn` | `payable`, `vendor_advance` | P2, P3, P4, P7 |
| `import_purchase` | Import cleared: goods, PPN impor, PPh 22 prepaid, duty paid | `inventory`, `tax_input_ppn`, `prepaid_tax_22_23_25` | `payable`, `bank` | P5 |
| `purchase_return` | Goods returned to the supplier, debit note | `payable` | `inventory`, `tax_input_ppn` | P6 |
| `vendor_advance` | Down payment to a supplier | `vendor_advance`, `tax_input_ppn` | `bank` | P7 |
| `payment_out` | Supplier paid; PPh 23 or a final tax withheld; bank fee | `payable`, `bank_charges` | `bank`, `wht_payable_23`, `wht_payable_final` | P1, P2, P3, C1 |
| `landed_cost` | Freight, duty or handling added to the stock it brought in (estimate at receipt) | `inventory` | `landed_cost_clearing` | SC2 |
| `landed_cost_invoice` | The forwarder's or customs invoice that clears the landed-cost estimate | `landed_cost_clearing`, `tax_input_ppn` | `payable` | SC2 |
| `standard_cost_receipt` | Receipt at standard cost with the price variance | `inventory`, `purchase_price_variance` | `payable` | I7 |
| `accrual` | Period end: service received, not yet invoiced (also interest, employee claims) | `expense` | `accrued_liability` | P8, E13, O1, O4 |
| `prepayment` | Paid in advance: rent, insurance, subscriptions | `prepaid_expense` | `bank` | E8, O6 |
| `prepaid_release` | Monthly release of a prepayment to expense | `expense` | `prepaid_expense` | E11, O6 |
| `share_issue` | Capital paid in | `bank` | `share_capital` | E1, O5 |
| `dividend_declared` | Dividend declared by the shareholders' meeting | `retained_earnings` | `dividend_payable` | O2 |
| `intercompany_charge` | Head office or a group company charges another (seller side) | `intercompany_receivable` | `intercompany_revenue`, `tax_output_ppn` | O3 |
| `intercompany_cost` | The same charge in the receiving company | `service_expense`, `tax_input_ppn` | `intercompany_payable` | O3 |
| `cash_transfer` | Money moved between two cash or bank accounts | `bank_in` | `bank_out` | C2 |
| `cash_receipt_other` | Bank line with no document: interest, refund (user picks the counterpart) | `bank` | `counterpart` | C1 |
| `cash_payment_other` | Bank line with no document: charges, petty cash spend (user picks the counterpart) | `counterpart` | `bank` | C1, C2 |
| `employee_advance` | Cash advance (kasbon, CA) paid to an employee | `employee_advance` | `bank` | C3 |
| `advance_settlement` | The employee accounts for the advance: expenses, unspent cash back, overspend owed to them | `expense`, `tax_input_ppn`, `bank` | `employee_advance`, `reimbursement_payable` | C3 |
| `expense_claim` | Reimbursement claim approved: the employee paid with their own money | `expense`, `tax_input_ppn` | `reimbursement_payable` | C6 |
| `reimbursement_payment` | The company pays the employee what it owes (a claim or an overspent advance) | `reimbursement_payable` | `bank` | C3, C6 |
| `fx_revaluation_gain` | Month end: foreign-currency balance restated upward (period-close.mjs) | `revalued_account` | `fx_unrealised_gain_loss` | C5 |
| `fx_revaluation_loss` | Month end: foreign-currency balance restated downward | `fx_unrealised_gain_loss` | `revalued_account` | C5 |
| `stock_shortage` | Stock count finds less than the books | `inventory_adjustment` | `inventory` | I4, E16 |
| `stock_issue` | Stock consumed by a cost centre, a vessel, a project (expense role per issue) | `expense` | `inventory` | I5 |
| `stock_transfer_out` | Stock dispatched to another warehouse (in transit) | `inventory_in_transit` | `inventory_from` | I3 |
| `stock_transfer_in` | Stock received at the other warehouse | `inventory_to` | `inventory_in_transit` | I3 |
| `inventory_writedown` | Net realisable value below cost | `inventory_writedown_expense` | `inventory_valuation_allowance` | I2 |
| `wip_material` | Materials issued to a work order | `wip` | `raw_materials` | I6 |
| `wip_labour` | Direct labour charged to a work order | `wip` | `wages_payable` | I6 |
| `overhead_applied` | Overhead applied to a work order at the standard rate | `wip` | `overhead_applied` | I6 |
| `overhead_incurred` | Actual overhead spent | `overhead_actual` | `bank`, `payable` | I6 |
| `production_complete` | Work order finished into finished goods | `finished_goods` | `wip` | I6 |
| `overhead_close` | Period end: under-applied overhead to cost of sales | `overhead_applied`, `cogs` | `overhead_actual` | I6 |
| `asset_acquisition` | Fixed asset bought (on credit or cash) | `fixed_asset`, `tax_input_ppn` | `payable`, `bank` | F1, E2 |
| `depreciation` | Monthly depreciation run per asset | `depreciation_expense` | `accumulated_depreciation` | F2, E12 |
| `asset_disposal` | Asset sold or scrapped | `bank`, `accumulated_depreciation`, `disposal_loss` | `fixed_asset`, `tax_output_ppn`, `disposal_gain` | F3 |
| `payroll_accrual` | Payroll run approved: gross pay, employer BPJS, deductions | `salary_expense`, `employer_bpjs_expense` | `payroll_payable`, `bpjs_employment_payable`, `bpjs_health_payable`, `wht_payable_21` | PY1 |
| `payroll_payment` | Net pay transferred | `payroll_payable` | `bank` | PY2, E10 |
| `payroll_remittance` | BPJS and PPh 21 paid to the state | `bpjs_employment_payable`, `bpjs_health_payable`, `wht_payable_21` | `bank` | PY3 |
| `thr_accrual` | Monthly THR accrual | `thr_expense` | `thr_accrual` | PY4 |
| `pph21_true_up` | December PPh 21 recalculated on the year | `payroll_payable` | `wht_payable_21` | PY5 |
| `ppn_settlement` | Masa PPN closed: output against input | `tax_output_ppn`, `ppn_receivable` | `tax_input_ppn`, `ppn_payable` | V2, V3 |
| `tax_payment` | PPN, PPh 23, final tax or PPh 29 paid | `ppn_payable`, `wht_payable_23`, `wht_payable_final`, `income_tax_payable` | `bank` | V2, P2, P3 |
| `final_tax` | Final tax on turnover the company owes itself (UMKM, PPh 15 when not cut) | `final_tax_expense` | `wht_payable_final` | T1 |
| `current_tax` | Year end: corporate income tax less prepaid | `income_tax_expense` | `prepaid_tax_22_23_25`, `income_tax_payable` | T2 |
| `deferred_tax` | Temporary difference between book and tax | `deferred_tax_asset` | `deferred_tax_income` | A5, F2, T2 |
| `advance_billing` | Invoiced before it is earned: freight at loading, a subscription, a milestone billed ahead | `receivable` | `contract_liability`, `tax_output_ppn` | VY1, CR1 |
| `revenue_over_time` | Period end: the share earned (voyage days load to discharge, months of a subscription) | `contract_liability`, `contract_asset` | `earned_revenue` | VY2, CR1 |
| `demurrage_claim` | Demurrage becomes highly probable and measurable | `contract_asset` | `demurrage_revenue` | VY3 |
| `demurrage_invoice` | Demurrage invoiced to the charterer | `receivable` | `contract_asset`, `tax_output_ppn` | VY3 |
| `bunker_consumption` | Fuel burned on a voyage, from the bunker report | `voyage_expense` | `bunker_inventory` | VY4 |

Worked entry codes: A and P in `ar-ap-ppn.md`, V in `ar-ap-ppn.md`, I, F and C
in `inventory-assets-cash.md`, PY in `payroll.md`, T and O in
`income-tax-other-cycles.md`, E in `journals-and-gl.md`, SC in
`domains/supply-chain.md`, VY in `domains/voyage-shipping.md`, CR in
`domains/crm-invoicing.md`.

## Roles and where they usually point

The default chart (`assets/coa-template-id.json`) carries the accounts marked
with a code. The rest are added when the company has that activity; the type
is what the engine needs, the name is the usual Indonesian one.

| Role key | Account type | Usual account | Template code |
|---|---|---|---|
| `bank` | asset, cash_flow cash | Kas / Bank (the chosen payment journal) | 1-1100, 1-1200 |
| `bank_in`, `bank_out` | asset, cash_flow cash | the two accounts of a transfer | 1-1100, 1-1200 |
| `receivable` | asset, control customer | Piutang Usaha | 1-1300 |
| `credit_loss_allowance` | contra_asset | Cadangan Kerugian Penurunan Nilai Piutang | 1-1310 |
| `intercompany_receivable` | asset | Piutang Pihak Berelasi | 1-1400 |
| `inventory`, `inventory_from`, `inventory_to` | asset, control item_and_location | Persediaan (one per warehouse when needed) | 1-1500 |
| `inventory_in_transit` | asset | Persediaan dalam Perjalanan | |
| `raw_materials`, `wip`, `finished_goods` | asset | Persediaan Bahan Baku, Barang dalam Proses, Barang Jadi | |
| `bunker_inventory` | asset | Persediaan Bahan Bakar Kapal | |
| `inventory_valuation_allowance` | contra_asset | Cadangan Penurunan Nilai Persediaan | |
| `tax_input_ppn` | asset | PPN Masukan | 1-1700 |
| `ppn_receivable` | asset | PPN Lebih Bayar | |
| `prepaid_tax_22_23_25` | asset | Pajak Dibayar di Muka (PPh 22, 23, 25) | 1-1800 |
| `prepaid_expense` | asset | Biaya Dibayar di Muka | |
| `vendor_advance` | asset | Uang Muka Pembelian | |
| `employee_advance` | asset, control employee | Uang Muka Karyawan | |
| `contract_asset` | asset | Aset Kontrak / Pendapatan Belum Ditagih | |
| `deferred_tax_asset` | asset | Aset Pajak Tangguhan | |
| `fixed_asset` | asset, control asset_register, cash_flow investing | Aset Tetap (one per class) | 1-2100 |
| `accumulated_depreciation` | contra_asset | Akumulasi Penyusutan | 1-2190 |
| `payable` | liability, control supplier | Utang Usaha | 2-1100 |
| `stock_received_not_billed` | liability | Barang Diterima Belum Ditagih (GR/IR) | |
| `landed_cost_clearing` | liability | Biaya Impor/Angkut Belum Ditagih | |
| `accrued_liability`, `payroll_payable`, `wages_payable` | liability | Biaya yang Masih Harus Dibayar, Utang Gaji | 2-1200 |
| `customer_advance`, `contract_liability` | liability | Uang Muka Pelanggan / Pendapatan Diterima di Muka | 2-1300 |
| `tax_output_ppn` | liability | PPN Keluaran | 2-1400 |
| `ppn_payable` | liability | Utang PPN | |
| `wht_payable_21` | liability | Utang PPh 21 | 2-1500 |
| `wht_payable_23`, `wht_payable_final`, `income_tax_payable` | liability | Utang PPh 23, Utang PPh Final (4(2), 15), Utang PPh 29 | 2-1510 |
| `reimbursement_payable` | liability, control employee | Utang Reimbursement Karyawan | |
| `bpjs_employment_payable`, `bpjs_health_payable` | liability | Utang BPJS Ketenagakerjaan, Utang BPJS Kesehatan | |
| `thr_accrual` | liability | Akrual THR | |
| `dividend_payable` | liability | Utang Dividen | |
| `intercompany_payable` | liability | Utang Pihak Berelasi | |
| `share_capital` | equity, cash_flow financing | Modal Disetor | 3-1000 |
| `retained_earnings` | equity, cash_flow profit | Laba Ditahan | 3-3000 |
| `sales`, `service_revenue`, `earned_revenue`, `demurrage_revenue`, `intercompany_revenue` | revenue | Penjualan, Pendapatan Jasa, Pendapatan Freight or Langganan (per contract), Pendapatan Demurrage | 4-1000, 4-2000 |
| `sales_return` | contra_revenue | Retur dan Potongan Penjualan | 4-1100 |
| `cogs` | expense, pl cogs | Harga Pokok Penjualan | 5-0000 |
| `voyage_expense` | expense, pl cogs | Beban Voyage (bunker, pelabuhan) | |
| `expense`, `service_expense`, `counterpart` | expense (chosen per document) | the expense the line is for | 6-0000 |
| `salary_expense`, `employer_bpjs_expense`, `thr_expense` | expense | Beban Gaji, Beban BPJS Pemberi Kerja, Beban THR | |
| `depreciation_expense`, `credit_loss_expense`, `inventory_writedown_expense`, `inventory_adjustment` | expense | Beban Penyusutan, Beban Kerugian Kredit, Beban Penurunan Nilai Persediaan, Beban Selisih Persediaan | |
| `bank_charges` | expense | Beban Administrasi Bank | |
| `overhead_actual`, `overhead_applied`, `purchase_price_variance` | expense | Overhead Sebenarnya, Overhead Dibebankan, Selisih Harga Bahan | |
| `fx_unrealised_gain_loss`, `disposal_gain`, `disposal_loss` | temporary | Selisih Kurs Belum Terealisasi, Laba/Rugi Pelepasan Aset | 7-0000 |
| `final_tax_expense` | expense, pl income_tax | Beban Pajak Final | 8-0000 |
| `income_tax_expense`, `deferred_tax_income` | expense, pl income_tax | Beban Pajak Kini, Beban (Manfaat) Pajak Tangguhan | 8-0000 |
| `revalued_account` | the foreign-currency account being restated | Bank USD, Piutang USD | |

## Adding an event

1. Find the worked entry in the topic file, or write one there: balanced, with
   its total, labelled CONSTRUCTED and its rule sourced.
2. Add the event to `EVENTS` with its `ref`, debit roles and credit roles. One
   role per side at most; a role on both sides means it is two events.
3. Add a row here (the test fails until you do) and a replay in
   `test/accounting.mjs` (the test fails until you do).
4. Add the role keys to the company's default accounts, or pass them per
   request when the user chooses the account.
