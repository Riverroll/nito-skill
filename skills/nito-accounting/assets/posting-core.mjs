// Starter posting core for an ERP ledger. Pure functions, no database, no
// dependencies: copy it into a project and call it from the service that owns
// the ledger tables (see references/starter-implementation.md).
//
// This is a DESIGN, drawn from how Odoo, ERPNext, Oracle and Dynamics post
// (references/real-systems-db-enforcement.md, references/posting-contract.md).
// It is not a copy of any of them. test/accounting.mjs exercises every rule.
//
// Money is a decimal STRING ("105450000.00") at every boundary and a BigInt of
// minor units inside. A JavaScript number is rejected, because a float cannot
// hold 0.1 exactly.

export const SCALE = 2; // decimal places stored, matching DECIMAL(18,2)

export function toMinor(value) {
  if (typeof value !== "string") throw new TypeError(`amount must be a decimal string, got ${typeof value}`);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) throw new RangeError(`not a non-negative decimal amount: "${value}"`);
  const frac = m[2] ?? "";
  if (frac.length > SCALE) throw new RangeError(`more than ${SCALE} decimal places: "${value}"`);
  return BigInt(m[1]) * 10n ** BigInt(SCALE) + BigInt(frac.padEnd(SCALE, "0") || "0");
}

export function fromMinor(minor) {
  const s = minor.toString().padStart(SCALE + 1, "0");
  return `${s.slice(0, -SCALE)}.${s.slice(-SCALE)}`;
}

// Which side each role lands on, per event. A module sends amounts by role and
// never names an account or a side. A role left out of the request is skipped,
// so one event covers "with PPN" and "without PPN", "with withholding" and
// "without". `ref` names the worked entry in the references that the shape
// reproduces; test/accounting.mjs replays every event, and
// references/event-catalogue.md lists them for people.
//
// Some roles are not fixed company defaults but chosen per document, the way
// an item carries its expense account: `counterpart`, `expense`,
// `revalued_account`, and the warehouse accounts of a transfer. The service
// passes them in the defaults for that one request:
//   buildEntry(req, { ...defaults, expense: line.expense_account })
export const EVENTS = {
  // ---- sales and receivables (references/ar-ap-ppn.md)
  sale_invoice:           { ref: "A1, A3", debit: ["receivable", "customer_advance"], credit: ["sales", "tax_output_ppn"] },
  sale_cogs:              { ref: "A1", debit: ["cogs"], credit: ["inventory"] },
  service_invoice:        { ref: "A2", debit: ["receivable", "customer_advance"], credit: ["service_revenue", "tax_output_ppn"] },
  customer_advance:       { ref: "A3, E9", debit: ["bank"], credit: ["customer_advance", "tax_output_ppn"] },
  advance_earned:         { ref: "E14", debit: ["customer_advance"], credit: ["service_revenue"] },
  sale_return:            { ref: "A4", debit: ["sales_return", "tax_output_ppn"], credit: ["receivable"] },
  sale_return_cost:       { ref: "A4", debit: ["inventory"], credit: ["cogs"] },
  // a customer that is a withholding agent cuts PPh 23 (prepaid, creditable) or
  // a final tax such as PPh 4(2) or PPh 15 (an expense, not creditable)
  receipt_in:             { ref: "A2, C4", debit: ["bank", "prepaid_tax_22_23_25", "final_tax_expense", "bank_charges"], credit: ["receivable"] },
  credit_loss_provision:  { ref: "A5, E15", debit: ["credit_loss_expense"], credit: ["credit_loss_allowance"] },
  receivable_write_off:   { ref: "A6", debit: ["credit_loss_allowance"], credit: ["receivable"] },

  // ---- purchasing and payables
  goods_receipt:          { ref: "P1", debit: ["inventory"], credit: ["stock_received_not_billed"] },
  vendor_invoice:         { ref: "P1", debit: ["stock_received_not_billed", "tax_input_ppn"], credit: ["payable"] },
  vendor_service_invoice: { ref: "P2, P3, P4", debit: ["service_expense", "tax_input_ppn"], credit: ["payable"] },
  import_purchase:        { ref: "P5", debit: ["inventory", "tax_input_ppn", "prepaid_tax_22_23_25"], credit: ["payable", "bank"] },
  purchase_return:        { ref: "P6", debit: ["payable"], credit: ["inventory", "tax_input_ppn"] },
  vendor_advance:         { ref: "P7", debit: ["vendor_advance", "tax_input_ppn"], credit: ["bank"] },
  payment_out:            { ref: "P1, P2, P3, C1", debit: ["payable", "bank_charges"], credit: ["bank", "wht_payable_23", "wht_payable_final"] },
  // landed cost: freight, duty and handling to bring stock to its place (IAS 2.10-11)
  landed_cost:            { ref: "SC2", debit: ["inventory"], credit: ["landed_cost_clearing"] },
  landed_cost_invoice:    { ref: "SC2", debit: ["landed_cost_clearing", "tax_input_ppn"], credit: ["payable"] },
  standard_cost_receipt:  { ref: "I7", debit: ["inventory", "purchase_price_variance"], credit: ["payable"] },

  // ---- accruals, prepayments, other cycles (references/income-tax-other-cycles.md, journals-and-gl.md)
  accrual:                { ref: "P8, E13, O1, O4", debit: ["expense"], credit: ["accrued_liability"] },
  prepayment:             { ref: "E8, O6", debit: ["prepaid_expense"], credit: ["bank"] },
  prepaid_release:        { ref: "E11, O6", debit: ["expense"], credit: ["prepaid_expense"] },
  share_issue:            { ref: "E1, O5", debit: ["bank"], credit: ["share_capital"] },
  dividend_declared:      { ref: "O2", debit: ["retained_earnings"], credit: ["dividend_payable"] },
  intercompany_charge:    { ref: "O3", debit: ["intercompany_receivable"], credit: ["intercompany_revenue", "tax_output_ppn"] },
  intercompany_cost:      { ref: "O3", debit: ["service_expense", "tax_input_ppn"], credit: ["intercompany_payable"] },

  // ---- cash and bank (references/inventory-assets-cash.md)
  cash_transfer:          { ref: "C2", debit: ["bank_in"], credit: ["bank_out"] },
  // A bank-statement line with no document behind it (interest, charges). The
  // user picks the counterpart account, as on a statement line in Odoo; the
  // service must refuse control accounts there, which validateEntry does not
  // know to do because the entry carries a source.
  cash_receipt_other:     { ref: "C1", debit: ["bank"], credit: ["counterpart"] },
  cash_payment_other:     { ref: "C1, C2", debit: ["counterpart"], credit: ["bank"] },
  fx_revaluation_gain:    { ref: "C5", debit: ["revalued_account"], credit: ["fx_unrealised_gain_loss"] },
  fx_revaluation_loss:    { ref: "C5", debit: ["fx_unrealised_gain_loss"], credit: ["revalued_account"] },

  // ---- inventory and production
  stock_shortage:         { ref: "I4, E16", debit: ["inventory_adjustment"], credit: ["inventory"] },
  stock_issue:            { ref: "I5", debit: ["expense"], credit: ["inventory"] },
  stock_transfer_out:     { ref: "I3", debit: ["inventory_in_transit"], credit: ["inventory_from"] },
  stock_transfer_in:      { ref: "I3", debit: ["inventory_to"], credit: ["inventory_in_transit"] },
  inventory_writedown:    { ref: "I2", debit: ["inventory_writedown_expense"], credit: ["inventory_valuation_allowance"] },
  wip_material:           { ref: "I6", debit: ["wip"], credit: ["raw_materials"] },
  wip_labour:             { ref: "I6", debit: ["wip"], credit: ["wages_payable"] },
  overhead_applied:       { ref: "I6", debit: ["wip"], credit: ["overhead_applied"] },
  overhead_incurred:      { ref: "I6", debit: ["overhead_actual"], credit: ["bank", "payable"] },
  production_complete:    { ref: "I6", debit: ["finished_goods"], credit: ["wip"] },
  overhead_close:         { ref: "I6", debit: ["overhead_applied", "cogs"], credit: ["overhead_actual"] },

  // ---- fixed assets
  asset_acquisition:      { ref: "F1, E2", debit: ["fixed_asset", "tax_input_ppn"], credit: ["payable", "bank"] },
  depreciation:           { ref: "F2, E12", debit: ["depreciation_expense"], credit: ["accumulated_depreciation"] },
  asset_disposal:         { ref: "F3", debit: ["bank", "accumulated_depreciation", "disposal_loss"], credit: ["fixed_asset", "tax_output_ppn", "disposal_gain"] },

  // ---- payroll (references/payroll.md)
  payroll_accrual:        { ref: "PY1", debit: ["salary_expense", "employer_bpjs_expense"], credit: ["payroll_payable", "bpjs_employment_payable", "bpjs_health_payable", "wht_payable_21"] },
  payroll_payment:        { ref: "PY2, E10", debit: ["payroll_payable"], credit: ["bank"] },
  payroll_remittance:     { ref: "PY3", debit: ["bpjs_employment_payable", "bpjs_health_payable", "wht_payable_21"], credit: ["bank"] },
  thr_accrual:            { ref: "PY4", debit: ["thr_expense"], credit: ["thr_accrual"] },
  pph21_true_up:          { ref: "PY5", debit: ["payroll_payable"], credit: ["wht_payable_21"] },

  // ---- tax (references/ar-ap-ppn.md, income-tax-other-cycles.md)
  ppn_settlement:         { ref: "V2, V3", debit: ["tax_output_ppn", "ppn_receivable"], credit: ["tax_input_ppn", "ppn_payable"] },
  tax_payment:            { ref: "V2, P2, P3", debit: ["ppn_payable", "wht_payable_23", "wht_payable_final", "income_tax_payable"], credit: ["bank"] },
  final_tax:              { ref: "T1", debit: ["final_tax_expense"], credit: ["wht_payable_final"] },
  current_tax:            { ref: "T2", debit: ["income_tax_expense"], credit: ["prepaid_tax_22_23_25", "income_tax_payable"] },
  deferred_tax:           { ref: "A5, F2, T2", debit: ["deferred_tax_asset"], credit: ["deferred_tax_income"] },

  // ---- voyage and freight (references/domains/voyage-shipping.md)
  freight_invoice:        { ref: "VY1", debit: ["receivable"], credit: ["contract_liability", "tax_output_ppn"] },
  voyage_revenue:         { ref: "VY2", debit: ["contract_liability", "contract_asset"], credit: ["freight_revenue"] },
  demurrage_claim:        { ref: "VY3", debit: ["contract_asset"], credit: ["demurrage_revenue"] },
  demurrage_invoice:      { ref: "VY3", debit: ["receivable"], credit: ["contract_asset", "tax_output_ppn"] },
  bunker_consumption:     { ref: "VY4", debit: ["voyage_expense"], credit: ["bunker_inventory"] },
};

// amount x num / den, rounded half up to SCALE places. For PPN on DPP nilai
// lain: percentOf(dpp, 12n * 11n, 100n * 12n). The rates are parameters
// (references/values-to-verify.md), never constants in code. The rounding rule
// for PPN and PPh is not settled in the research: confirm it before relying on it.
export function percentOf(amount, num, den) {
  const a = toMinor(amount);
  return fromMinor((a * num * 2n + den) / (den * 2n));
}

// request: { event_type, amounts: { role: "decimal string" }, ...header fields }
// defaults: { role: account_code }  (the company's account-determination keys)
//
// A company with several cash and bank accounts keeps one payment journal per
// account (Kas, Bank BCA, Bank Mandiri). The user picks the journal; the
// service passes that journal's account for the role, never a code the module
// made up: buildEntry(req, { ...defaults, bank: journal.account }). A transfer
// fills bank_in and bank_out the same way.
// Returns { ok: true, entry } or { ok: false, errors: [...] }.
export function buildEntry(request, defaults) {
  const errors = [];
  const shape = EVENTS[request.event_type];
  if (!shape) return { ok: false, errors: [`unknown event_type "${request.event_type}"`] };
  if (!request.idempotency_key) errors.push("idempotency_key is required");
  if (!request.source_type || !request.source_id) errors.push("source_type and source_id are required");

  const known = new Set([...shape.debit, ...shape.credit]);
  for (const role of Object.keys(request.amounts ?? {}))
    if (!known.has(role)) errors.push(`role "${role}" is not part of event "${request.event_type}"`);

  const lines = [];
  for (const side of ["debit", "credit"]) {
    for (const role of shape[side]) {
      const raw = request.amounts?.[role];
      if (raw === undefined) continue; // an optional role, for example no PPN for a non-PKP company
      let minor;
      try { minor = toMinor(raw); } catch (e) { errors.push(`${role}: ${e.message}`); continue; }
      if (minor === 0n) continue;
      const account = defaults[role];
      // A missing key rejects the posting. Falling back to a suspense account
      // would hide a configuration error.
      if (!account) { errors.push(`no account configured for role "${role}"`); continue; }
      lines.push({ account, role, debit: side === "debit" ? fromMinor(minor) : fromMinor(0n),
                   credit: side === "credit" ? fromMinor(minor) : fromMinor(0n) });
    }
  }
  if (errors.length) return { ok: false, errors };
  const { amounts, ...header } = request;
  return { ok: true, entry: { ...header, status: "draft", lines } };
}

// ctx: { accounts: { code: { active, postable, control } }, isPeriodOpen(date) }
export function validateEntry(entry, ctx) {
  const errors = [];
  const lines = entry.lines ?? [];
  if (lines.length < 2) errors.push("an entry needs at least two lines");
  let dr = 0n, cr = 0n;
  lines.forEach((l, i) => {
    let d, c;
    try { d = toMinor(l.debit); c = toMinor(l.credit); }
    catch (e) { errors.push(`line ${i + 1}: ${e.message}`); return; }
    if ((d > 0n) === (c > 0n)) errors.push(`line ${i + 1}: exactly one of debit and credit must be above zero`);
    dr += d; cr += c;
    const acc = ctx.accounts[l.account];
    if (!acc) errors.push(`line ${i + 1}: unknown account ${l.account}`);
    else {
      if (!acc.active) errors.push(`line ${i + 1}: account ${l.account} is inactive`);
      if (!acc.postable) errors.push(`line ${i + 1}: account ${l.account} is a group account`);
      if (acc.control && !entry.source_type)
        errors.push(`line ${i + 1}: ${l.account} is a control account and takes no manual posting`);
    }
  });
  if (dr !== cr) errors.push(`entry does not balance: debit ${fromMinor(dr)}, credit ${fromMinor(cr)}`);
  if (!entry.posting_date) errors.push("posting_date is required");
  else if (!ctx.isPeriodOpen(entry.posting_date)) errors.push(`period is closed for ${entry.posting_date}`);
  if (entry.approved_by && entry.approved_by === entry.created_by)
    errors.push("approver must differ from maker");
  return { ok: errors.length === 0, errors, total: fromMinor(dr) };
}

// A posted entry is never edited. This returns the new entry that cancels it.
export function reverseEntry(posted, { posting_date, idempotency_key, created_by }) {
  if (posted.status !== "posted") throw new Error("only a posted entry can be reversed");
  return {
    ...posted, status: "draft", entry_number: undefined, approved_by: undefined,
    posting_date, idempotency_key, created_by, reverses_entry_number: posted.entry_number,
    lines: posted.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

// Trial balance from posted lines: per account, and the two grand totals,
// which must be equal. A "reversed" entry still counts: it stays in the ledger
// and its reversing entry is what cancels it. Only drafts are left out.
export function trialBalance(entries) {
  const acc = new Map();
  let dr = 0n, cr = 0n;
  for (const e of entries) {
    if (e.status !== "posted" && e.status !== "reversed") continue;
    for (const l of e.lines) {
      const a = acc.get(l.account) ?? { debit: 0n, credit: 0n };
      a.debit += toMinor(l.debit); a.credit += toMinor(l.credit);
      acc.set(l.account, a);
      dr += toMinor(l.debit); cr += toMinor(l.credit);
    }
  }
  const rows = [...acc].sort().map(([account, a]) => {
    const net = a.debit - a.credit;
    return { account, debit: fromMinor(net > 0n ? net : 0n), credit: fromMinor(net < 0n ? -net : 0n) };
  });
  return { rows, total_debit: fromMinor(dr), total_credit: fromMinor(cr), balanced: dr === cr };
}
