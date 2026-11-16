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
// never names an account or a side. Extend this table per module; the shapes
// here are the worked entries A1 and P1 in references/ar-ap-ppn.md.
export const EVENTS = {
  sale_invoice:    { debit: ["receivable"],                 credit: ["sales", "tax_output_ppn"] },
  sale_cogs:       { debit: ["cogs"],                       credit: ["inventory"] },
  goods_receipt:   { debit: ["inventory"],                  credit: ["stock_received_not_billed"] },
  vendor_invoice:  { debit: ["stock_received_not_billed", "tax_input_ppn"], credit: ["payable"] },
  payment_out:     { debit: ["payable"],                    credit: ["bank"] },
  receipt_in:      { debit: ["bank"],                       credit: ["receivable"] },
};

// request: { event_type, amounts: { role: "decimal string" }, ...header fields }
// defaults: { role: account_code }  (the company's account-determination keys)
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
// which must be equal.
export function trialBalance(entries) {
  const acc = new Map();
  let dr = 0n, cr = 0n;
  for (const e of entries) {
    if (e.status !== "posted") continue;
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
