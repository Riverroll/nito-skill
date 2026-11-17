# Other domains: manufacturing, projects, transport, rental, retail, services

> Part of the `nito-accounting` skill. Each section maps a domain onto events
> that already exist, with their worked entries. The rules keep the labels of
> the topic files they come from; nothing new is sourced here.

| Domain | Operational objects | Events | Tag with `analytic_ref` | Indonesian tax points | Read |
|---|---|---|---|---|---|
| Manufacturing | Work order, bill of materials, routing | `wip_material`, `wip_labour`, `overhead_applied`, `overhead_incurred`, `production_complete`, `overhead_close`, `standard_cost_receipt` (I6, I7) | work order | PPN on materials as purchases | `../inventory-assets-cash.md` |
| Projects and construction | Contract, milestone, progress claim, retention | `advance_billing`, `revenue_over_time` (contract asset or liability), `vendor_service_invoice` for subcontractors, `payment_out` with `wht_payable_final` | project | Final PPh 4(2) on construction at 1.75%, 2.65%, 4%; consulting 3.5%, 6% (DJP deck citing PP 51/2008 as amended by PP 9/2022, GUIDANCE) | `../ar-ap-ppn.md`, `../values-to-verify.md` |
| Trucking, fleet, logistics | Trip, vehicle, delivery order | `service_invoice` per trip, `stock_issue` for fuel and spares, `vendor_service_invoice` for tolls and parking, `accrual` for driver allowances | trip or vehicle | PPh 23 2% when customers withhold on services (`receipt_in` with `prepaid_tax_22_23_25`) | this file, `voyage-shipping.md` for the per-trip pattern |
| Rental and leasing (lessor) | Contract, unit, invoice | `service_invoice` or `advance_billing` + `revenue_over_time` for hire paid ahead; `depreciation` of the units | contract or unit | PPh 23 2% on rent of assets other than land and buildings; final PPh 4(2) 10% on land and building rent (`../values-to-verify.md`) | `../inventory-assets-cash.md` (F4 lessee side) |
| Retail, POS, e-commerce | Sale, shift, settlement | `sale_invoice` to a gateway receivable, `sale_cogs`, `receipt_in` with `bank_charges` on settlement (C4), `cash_transfer` for cash drops | store or channel | PPN on retail sales; gateway fee PPN not modelled in C4 | `../inventory-assets-cash.md` |
| Professional services, agencies | Engagement, timesheet, invoice | `service_invoice`, `receipt_in` with PPh 23 cut (A2), `accrual` for work done not billed, `advance_billing` for retainers | engagement | PPh 23 2% (A2) | `../ar-ap-ppn.md`, `crm-invoicing.md` |
| HR and payroll | Payroll run, employee | `payroll_accrual`, `payroll_payment`, `payroll_remittance`, `thr_accrual`, `pph21_true_up` (PY1-PY5) | department as cost centre | PPh 21 TER, BPJS rates and caps (several UNVERIFIED or conflicting) | `../payroll.md` |
| Group companies | Charge between entities | `intercompany_charge`, `intercompany_cost` (O3), eliminated in the group view | counterparty entity | PPN on the charge | `../income-tax-other-cycles.md` |

## The pattern every domain repeats

1. The operational object (work order, trip, project, voyage, contract) gets
   an id, and that id rides on every line as `analytic_ref`.
2. Revenue that is earned over time is billed with `advance_billing` and
   recognised with `revenue_over_time`, or recognised first into a contract
   asset and billed later.
3. Stock consumed by the object is a `stock_issue` at valuation cost, with the
   object's expense account.
4. Third-party costs are `vendor_service_invoice` lines tagged with the
   object.
5. `reports.mjs` `byAnalytic` gives the object's margin; the statements stay
   by nature.
