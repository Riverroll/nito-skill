# Supply chain: purchasing, warehouse, inventory, delivery

> Part of the `nito-accounting` skill. Built on `../integration-playbook.md`.
> The procure-to-pay and inventory rules are those of `../ar-ap-ppn.md` and
> `../inventory-assets-cash.md` with their evidence labels; SC1-SC3 are
> CONSTRUCTED here (amounts invented). IAS 2 paragraph references come from
> secondary copies of the standard (SECONDARY), not the IFRS Foundation text.

A supply-chain module owns orders, receipts, stock moves, counts and
deliveries. The ledger needs a value at each point where ownership or
location changes. Quantities stay in the module; values go to the ledger.

## The flow and its events

| Step in the module | Event | Who computes the amount |
|---|---|---|
| Purchase requisition, RFQ, purchase order | none | |
| Goods received against the PO | `goods_receipt` (GR/IR) | PO price x quantity received |
| Supplier invoice matched (three-way match) | `vendor_invoice` | invoice; any price difference per company policy |
| Freight, duty, handling to bring the goods in | `landed_cost`, then `landed_cost_invoice` | the forwarder or customs document, allocated to the receipt |
| Import clearance | `import_purchase` (P5) | PIB values: CIF, duty, PPN impor, PPh 22 |
| Return to supplier | `purchase_return` (P6) | |
| Transfer between warehouses | `stock_transfer_out`, `stock_transfer_in` (I3) | valuation cost |
| Issue to production, a project, a vessel, a cost centre | `stock_issue` (I5) or `wip_material` (I6) | valuation cost; expense account per issue |
| Stock count difference | `stock_shortage` (I4) | valuation cost |
| Net realisable value below cost | `inventory_writedown` (I2) | |
| Delivery to the customer | `sale_cogs` (A1) | valuation cost |
| Customer invoice | `sale_invoice` (A1) | price |
| Customer return | `sale_return`, `sale_return_cost` (A4) | price; cost at the original issue |
| Freight to the customer | `vendor_service_invoice` as a selling expense (SC3) | |

**The cost of every issue comes from `assets/inventory-valuation.mjs`,** in
the stock module, per item and location: moving average or FIFO, the method
fixed in the company configuration (`inventory_costing`). The module sends the
amount; the ledger never revalues stock by itself.

## What belongs in the cost of stock

IAS 2.10 measures inventory at the costs of purchase, conversion and other
costs of bringing it to its present location and condition. IAS 2.11: costs
of purchase include the price, non-recoverable import duties and taxes, and
transport and handling directly attributable; trade discounts and rebates are
deducted; recoverable taxes such as creditable PPN Masukan are excluded
(SECONDARY copies of IAS 2). Selling costs are expensed, not added to stock
(IAS 2.16, SECONDARY). For a company that cannot credit its input PPN, the
PPN becomes part of the cost (P4 in `../ar-ap-ppn.md`).

## The worked entries

| Ref | CONSTRUCTED entry | Debit | Credit | Total (Rp) |
|---|---|---|---|---|
| SC1 | Goods received, 1,000 cartons at 80,000 | Persediaan 80,000,000 | GR/IR 80,000,000 | 80,000,000 |
| SC2 | Inbound freight added to the receipt, estimated | Persediaan 2,000,000 | Biaya Angkut Belum Ditagih 2,000,000 | 2,000,000 |
| SC2 | Forwarder's invoice, freight 2,000,000, PPN 220,000 | Biaya Angkut Belum Ditagih 2,000,000; PPN Masukan 220,000 | Utang Usaha 2,220,000 | 2,220,000 |
| SC3 | Outbound freight to a customer, a selling cost (PPN 165,000) | Beban Pengiriman Penjualan 1,500,000; PPN Masukan 165,000 | Utang Usaha 1,665,000 | 1,665,000 |

After SC1 and SC2 the 1,000 cartons stand at 82,000,000: unit cost 82,000,
which is the receipt the valuation module must record
(`receive("1000", "82000000.00")`) so the next issue carries the freight.

## Configuration the module needs

| Setting | Why |
|---|---|
| `inventory_costing` | moving average or FIFO, per company (or per item where the policy allows) |
| A stock account per location, or one with a site dimension | the stock ledger ties to the GL by location |
| GR/IR and landed-cost clearing accounts | the matching steps |
| Expense account per issue type | consumption by cost centre, vessel, project |
| Three-way-match tolerances | policy parameters, no regulatory source (`../ar-ap-ppn.md`) |

## Reconciliation

| Check | Must hold |
|---|---|
| Stock value per item and location (module) | = Persediaan per location (ledger) |
| GR/IR | = receipts not yet invoiced, zero once matched |
| Landed-cost clearing | = estimates not yet invoiced |
| In transit | = transfers dispatched, not received |
| Cost of sales | = sum of `sale_cogs` amounts the module sent |
