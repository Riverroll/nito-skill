#!/usr/bin/env node
// Checks the nito-accounting skill the way structure.mjs checks nito-design:
// the skill loads, every reference it names exists, the chart template is
// well formed, and every worked journal entry in the references balances.
//
//   node test/accounting.mjs
//
// A worked entry is any row of a markdown table that has a "Debit" and a
// "Credit" column. Amounts are written as "Account 1,000,000; Account 2,000".
// The test re-adds both cells: debits must equal credits, and both must equal
// the "Total" cell when the table has one.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills", "nito-accounting");
const refs = join(skill, "references");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

// ---- the skill loads -------------------------------------------------------
const skillMd = readFileSync(join(skill, "SKILL.md"), "utf8");
const fm = /^---\n([\s\S]*?)\n---\n/.exec(skillMd);
ok("SKILL.md has frontmatter", !!fm);
ok("frontmatter names the skill nito-accounting", /^name: nito-accounting$/m.test(fm?.[1] ?? ""));
ok("frontmatter has a description", /^description: .{80,}$/m.test(fm?.[1] ?? ""));

// ---- every reference the router names exists, and none is orphaned ---------
const named = new Set([...skillMd.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]));
const onDisk = readdirSync(refs).filter((f) => f.endsWith(".md"));
for (const f of named) ok(`references/${f} exists`, existsSync(join(refs, f)));
for (const f of onDisk) ok(`references/${f} is reachable from SKILL.md`, named.has(f));
for (const a of [...skillMd.matchAll(/assets\/([a-z0-9.-]+)/g)].map((m) => m[1]))
  ok(`assets/${a} exists`, existsSync(join(skill, "assets", a)));

// ---- the chart template -----------------------------------------------------
const coa = JSON.parse(readFileSync(join(skill, "assets", "coa-template-id.json"), "utf8"));
const TYPES = new Set(["asset", "contra_asset", "liability", "equity", "contra_equity",
                       "revenue", "contra_revenue", "expense", "temporary", "suspense"]);
const codes = coa.accounts.map((a) => a.code);
ok("chart: account codes are unique", new Set(codes).size === codes.length);
for (const a of coa.accounts) {
  ok(`chart ${a.code}: has a name, type and normal balance`,
     !!a.name && TYPES.has(a.type) && ["debit", "credit", "either"].includes(a.normal_balance),
     JSON.stringify(a));
  const natural = { asset: "debit", expense: "debit", contra_revenue: "debit", contra_equity: "debit",
                    liability: "credit", equity: "credit", revenue: "credit", contra_asset: "credit" }[a.type];
  if (natural) ok(`chart ${a.code}: normal balance matches its type`, a.normal_balance === natural,
                  `${a.type} is ${a.normal_balance}`);
}
ok("chart: says it is a constructed template", /constructed/i.test(coa.status ?? ""));

// ---- every worked entry balances -------------------------------------------
const amounts = (cell) =>
  [...cell.matchAll(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,])/g)].map((m) => Number(m[0].replaceAll(",", "")));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
let entries = 0;
for (const f of onDisk) {
  const lines = readFileSync(join(refs, f), "utf8").split("\n");
  let cols = null;
  for (const line of lines) {
    if (!line.startsWith("|")) { cols = null; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cols === null) {
      const d = cells.findIndex((c) => /^debit/i.test(c)), c = cells.findIndex((c) => /^credit/i.test(c));
      const t = cells.findIndex((c) => /^total/i.test(c));
      cols = d >= 0 && c >= 0 ? { d, c, t } : false;
      continue;
    }
    if (cols === false || /^[-: ]+$/.test(cells[0])) continue;
    const dr = amounts(cells[cols.d] ?? ""), cr = amounts(cells[cols.c] ?? "");
    if (!dr.length && !cr.length) continue;
    entries++;
    const id = `${f} ${cells[0]}`;
    ok(`${id}: debits equal credits`, sum(dr) === sum(cr), `${sum(dr)} vs ${sum(cr)}`);
    if (cols.t >= 0) {
      const tot = amounts(cells[cols.t]);
      if (tot.length === 1) ok(`${id}: total matches`, tot[0] === sum(dr), `${tot[0]} vs ${sum(dr)}`);
    }
  }
}
ok("worked entries were found to check", entries >= 40, String(entries));

// ---- the starter posting core ----------------------------------------------
const core = await import(join(skill, "assets", "posting-core.mjs"));
const defaults = { receivable: "1-1300", sales: "4-1000", tax_output_ppn: "2-1400", cogs: "5-0000",
                   inventory: "1-1500", stock_received_not_billed: "2-1150", tax_input_ppn: "1-1700",
                   payable: "2-1100", bank: "1-1200", service_revenue: "4-2000",
                   prepaid_tax_22_23_25: "1-1800", service_expense: "6-0000", wht_payable_23: "2-1510",
                   ppn_payable: "2-1410", ppn_receivable: "1-1750", fixed_asset: "1-2100",
                   accumulated_depreciation: "1-2190", depreciation_expense: "6-2000",
                   bank_charges: "6-0000", bank_in: "1-1100", bank_out: "1-1200", counterpart: "7-0000" };
const accounts = Object.fromEntries([...coa.accounts.map((a) => a.code), "2-1150", "2-1410", "1-1750", "6-2000"].map((c) =>
  [c, { active: true, postable: true, control: ["1-1300", "2-1100", "1-1500"].includes(c) }]));
const ctx = { accounts, isPeriodOpen: (d) => d >= "2026-01-01" && d <= "2026-12-31" };
const head = (n) => ({ idempotency_key: "k" + n, source_type: "doc", source_id: String(n),
                       posting_date: "2026-01-15", document_date: "2026-01-15", created_by: 1 });
const post = (event_type, amounts, n) => {
  const b = core.buildEntry({ event_type, amounts, ...head(n) }, defaults);
  if (!b.ok) return b;
  const v = core.validateEntry(b.entry, ctx);
  return v.ok ? { ok: true, total: v.total, entry: { ...b.entry, status: "posted", entry_number: "JV" + n } } : v;
};
// worked entries A1 and P1 from references/ar-ap-ppn.md, replayed through the core
const replay = [
  ["sale_invoice",   { receivable: "105450000.00", sales: "95000000.00", tax_output_ppn: "10450000.00" }, "105450000.00"],
  ["sale_cogs",      { cogs: "60000000.00", inventory: "60000000.00" }, "60000000.00"],
  ["goods_receipt",  { inventory: "80000000.00", stock_received_not_billed: "80000000.00" }, "80000000.00"],
  ["vendor_invoice", { stock_received_not_billed: "80000000.00", tax_input_ppn: "8800000.00", payable: "88800000.00" }, "88800000.00"],
  ["payment_out",    { payable: "88800000.00", bank: "88800000.00" }, "88800000.00"],
];
const posted = [];
replay.forEach(([ev, amt, total], i) => {
  const r = post(ev, amt, i + 1);
  ok(`core: ${ev} posts and totals ${total}`, r.ok && r.total === total, JSON.stringify(r.errors ?? r.total));
  if (r.ok) posted.push(r.entry);
});
const tb = core.trialBalance(posted);
ok("core: trial balance of the replayed entries balances", tb.balanced && tb.total_debit === "423050000.00", tb.total_debit);
const grir = tb.rows.find((r) => r.account === "2-1150");
ok("core: GR/IR clears to zero after receipt and invoice", grir && grir.debit === "0.00" && grir.credit === "0.00");
// the other events, each replaying a worked entry from the references
const more = [
  ["A2 service invoice", "service_invoice", { receivable: "55500000.00", service_revenue: "50000000.00", tax_output_ppn: "5500000.00" }, "55500000.00"],
  ["A2 receipt net of PPh 23", "receipt_in", { bank: "54500000.00", prepaid_tax_22_23_25: "1000000.00", receivable: "55500000.00" }, "55500000.00"],
  ["P2 service invoice", "vendor_service_invoice", { service_expense: "40000000.00", tax_input_ppn: "4400000.00", payable: "44400000.00" }, "44400000.00"],
  ["P2 payment net of PPh 23", "payment_out", { payable: "44400000.00", bank: "43600000.00", wht_payable_23: "800000.00" }, "44400000.00"],
  ["P2 remittance", "tax_payment", { wht_payable_23: "800000.00", bank: "800000.00" }, "800000.00"],
  ["V2 PPN settlement", "ppn_settlement", { tax_output_ppn: "125000000.00", tax_input_ppn: "98000000.00", ppn_payable: "27000000.00" }, "125000000.00"],
  ["V2 PPN payment", "tax_payment", { ppn_payable: "27000000.00", bank: "27000000.00" }, "27000000.00"],
  ["V3 PPN carry forward", "ppn_settlement", { tax_output_ppn: "60000000.00", ppn_receivable: "25000000.00", tax_input_ppn: "85000000.00" }, "85000000.00"],
  ["F1 asset acquisition", "asset_acquisition", { fixed_asset: "128000000.00", tax_input_ppn: "14080000.00", payable: "142080000.00" }, "142080000.00"],
  ["F2 depreciation", "depreciation", { depreciation_expense: "24000000.00", accumulated_depreciation: "24000000.00" }, "24000000.00"],
  ["C4 settlement net of a fee", "receipt_in", { bank: "1087800.00", bank_charges: "22200.00", receivable: "1110000.00" }, "1110000.00"],
  ["C2 petty cash set-up", "cash_transfer", { bank_in: "5000000.00", bank_out: "5000000.00" }, "5000000.00"],
  ["C1 interest", "cash_receipt_other", { bank: "250000.00", counterpart: "250000.00" }, "250000.00"],
  ["C1 bank charges", "cash_payment_other", { counterpart: "150000.00", bank: "150000.00" }, "150000.00"],
  // P1's payment with C1's bank charge on the transfer: no single worked entry, the two shapes combined
  ["P1 + C1 payment with a transfer fee", "payment_out", { payable: "88800000.00", bank_charges: "150000.00", bank: "88950000.00" }, "88950000.00"],
  // the rest of the catalogue: every worked entry that has an event
  ["A3 advance received", "customer_advance", { bank: "33300000.00", customer_advance: "30000000.00", tax_output_ppn: "3300000.00" }, "33300000.00"],
  ["A3 final invoice net of the advance", "sale_invoice", { customer_advance: "30000000.00", receivable: "77700000.00", sales: "100000000.00", tax_output_ppn: "7700000.00" }, "107700000.00"],
  ["E14 deposit earned", "advance_earned", { customer_advance: "2000000.00", service_revenue: "2000000.00" }, "2000000.00"],
  ["A4 sales return", "sale_return", { sales_return: "10000000.00", tax_output_ppn: "1100000.00", receivable: "11100000.00" }, "11100000.00"],
  ["A4 stock back at cost", "sale_return_cost", { inventory: "6000000.00", cogs: "6000000.00" }, "6000000.00"],
  ["A5 credit loss allowance", "credit_loss_provision", { credit_loss_expense: "3100000.00", credit_loss_allowance: "3100000.00" }, "3100000.00"],
  ["A5 deferred tax", "deferred_tax", { deferred_tax_asset: "682000.00", deferred_tax_income: "682000.00" }, "682000.00"],
  ["A6 write-off", "receivable_write_off", { credit_loss_allowance: "2000000.00", receivable: "2000000.00" }, "2000000.00"],
  ["P3 rent invoice", "vendor_service_invoice", { service_expense: "100000000.00", tax_input_ppn: "11000000.00", payable: "111000000.00" }, "111000000.00"],
  ["P3 payment net of final PPh 4(2)", "payment_out", { payable: "111000000.00", bank: "101000000.00", wht_payable_final: "10000000.00" }, "111000000.00"],
  ["P4 non-creditable input PPN in the cost", "vendor_service_invoice", { service_expense: "11100000.00", payable: "11100000.00" }, "11100000.00"],
  ["P5 import", "import_purchase", { inventory: "52500000.00", tax_input_ppn: "5775000.00", prepaid_tax_22_23_25: "1312500.00", payable: "50000000.00", bank: "9587500.00" }, "59587500.00"],
  ["P6 purchase return", "purchase_return", { payable: "11100000.00", inventory: "10000000.00", tax_input_ppn: "1100000.00" }, "11100000.00"],
  ["P7 vendor prepayment", "vendor_advance", { vendor_advance: "20000000.00", tax_input_ppn: "2200000.00", bank: "22200000.00" }, "22200000.00"],
  ["P8 accrual", "accrual", { expense: "20000000.00", accrued_liability: "20000000.00" }, "20000000.00"],
  ["E8 rent paid in advance", "prepayment", { prepaid_expense: "12000000.00", bank: "12000000.00" }, "12000000.00"],
  ["E11 one month released", "prepaid_release", { expense: "1000000.00", prepaid_expense: "1000000.00" }, "1000000.00"],
  ["O5 share issue", "share_issue", { bank: "1000000000.00", share_capital: "1000000000.00" }, "1000000000.00"],
  ["O2 dividend declared", "dividend_declared", { retained_earnings: "200000000.00", dividend_payable: "200000000.00" }, "200000000.00"],
  ["O3 head office charge", "intercompany_charge", { intercompany_receivable: "33300000.00", intercompany_revenue: "30000000.00", tax_output_ppn: "3300000.00" }, "33300000.00"],
  ["O3 site company cost", "intercompany_cost", { service_expense: "30000000.00", tax_input_ppn: "3300000.00", intercompany_payable: "33300000.00" }, "33300000.00"],
  ["C5 revaluation gain", "fx_revaluation_gain", { revalued_account: "3000000.00", fx_unrealised_gain_loss: "3000000.00" }, "3000000.00"],
  ["C5 mirrored: the same rate move downwards", "fx_revaluation_loss", { fx_unrealised_gain_loss: "3000000.00", revalued_account: "3000000.00" }, "3000000.00"],
  ["I2 NRV write-down", "inventory_writedown", { inventory_writedown_expense: "8000000.00", inventory_valuation_allowance: "8000000.00" }, "8000000.00"],
  ["I3 dispatch", "stock_transfer_out", { inventory_in_transit: "1100000.00", inventory_from: "1100000.00" }, "1100000.00"],
  ["I3 receipt", "stock_transfer_in", { inventory_to: "1100000.00", inventory_in_transit: "1100000.00" }, "1100000.00"],
  ["I4 count shortage", "stock_shortage", { inventory_adjustment: "100000.00", inventory: "100000.00" }, "100000.00"],
  ["I5 issue to a cost centre", "stock_issue", { expense: "2000000.00", inventory: "2000000.00" }, "2000000.00"],
  ["I6 materials", "wip_material", { wip: "30000000.00", raw_materials: "30000000.00" }, "30000000.00"],
  ["I6 labour", "wip_labour", { wip: "20000000.00", wages_payable: "20000000.00" }, "20000000.00"],
  ["I6 overhead applied", "overhead_applied", { wip: "30000000.00", overhead_applied: "30000000.00" }, "30000000.00"],
  ["I6 actual overhead", "overhead_incurred", { overhead_actual: "32000000.00", payable: "32000000.00" }, "32000000.00"],
  ["I6 finished goods", "production_complete", { finished_goods: "80000000.00", wip: "80000000.00" }, "80000000.00"],
  ["I6 under-applied overhead closed", "overhead_close", { overhead_applied: "30000000.00", cogs: "2000000.00", overhead_actual: "32000000.00" }, "32000000.00"],
  ["I7 standard cost receipt", "standard_cost_receipt", { inventory: "50000000.00", purchase_price_variance: "2000000.00", payable: "52000000.00" }, "52000000.00"],
  ["E2 equipment for cash", "asset_acquisition", { fixed_asset: "24000000.00", bank: "24000000.00" }, "24000000.00"],
  ["F3 disposal", "asset_disposal", { bank: "99900000.00", accumulated_depreciation: "48000000.00", fixed_asset: "128000000.00", tax_output_ppn: "9900000.00", disposal_gain: "10000000.00" }, "147900000.00"],
  ["PY1 payroll accrual", "payroll_accrual", { salary_expense: "8000000.00", employer_bpjs_expense: "819200.00", payroll_payable: "7554552.00", bpjs_employment_payable: "739200.00", bpjs_health_payable: "400000.00", wht_payable_21: "125448.00" }, "8819200.00"],
  ["PY2 net pay", "payroll_payment", { payroll_payable: "7554552.00", bank: "7554552.00" }, "7554552.00"],
  ["PY3 remittance", "payroll_remittance", { bpjs_employment_payable: "739200.00", bpjs_health_payable: "400000.00", wht_payable_21: "125448.00", bank: "1264648.00" }, "1264648.00"],
  ["PY4 THR accrual", "thr_accrual", { thr_expense: "666667.00", thr_accrual: "666667.00" }, "666667.00"],
  ["PY5 December true-up", "pph21_true_up", { payroll_payable: "543072.00", wht_payable_21: "543072.00" }, "543072.00"],
  ["P2 shape, final tax remitted", "tax_payment", { wht_payable_final: "10000000.00", bank: "10000000.00" }, "10000000.00"],
  ["T1 UMKM final tax", "final_tax", { final_tax_expense: "1500000.00", wht_payable_final: "1500000.00" }, "1500000.00"],
  ["T2 current tax", "current_tax", { income_tax_expense: "220902000.00", prepaid_tax_22_23_25: "152312500.00", income_tax_payable: "68589500.00" }, "220902000.00"],
  // supply chain and voyage: constructed in references/domains/
  ["SC2 freight added to stock", "landed_cost", { inventory: "2000000.00", landed_cost_clearing: "2000000.00" }, "2000000.00"],
  ["SC2 forwarder's invoice", "landed_cost_invoice", { landed_cost_clearing: "2000000.00", tax_input_ppn: "220000.00", payable: "2220000.00" }, "2220000.00"],
  ["VY1 freight invoiced at loading", "freight_invoice", { receivable: "555000000.00", contract_liability: "500000000.00", tax_output_ppn: "55000000.00" }, "555000000.00"],
  ["VY2 half the voyage done at month end", "voyage_revenue", { contract_liability: "250000000.00", freight_revenue: "250000000.00" }, "250000000.00"],
  ["VY3 demurrage once highly probable", "demurrage_claim", { contract_asset: "30000000.00", demurrage_revenue: "30000000.00" }, "30000000.00"],
  ["VY3 demurrage invoiced", "demurrage_invoice", { receivable: "33300000.00", contract_asset: "30000000.00", tax_output_ppn: "3300000.00" }, "33300000.00"],
  ["VY4 bunkers burned", "bunker_consumption", { voyage_expense: "440000000.00", bunker_inventory: "440000000.00" }, "440000000.00"],
  ["VY5 receipt net of PPh 15 cut by the charterer", "receipt_in", { bank: "549000000.00", final_tax_expense: "6000000.00", receivable: "555000000.00" }, "555000000.00"],
];
for (const r of Object.values(core.EVENTS).flatMap((s) => [...s.debit, ...s.credit])) if (!defaults[r]) defaults[r] = "7-0000";
{
  // choosing the payment journal changes the account, not the event
  const b = core.buildEntry({ event_type: "payment_out", amounts: { payable: "100.00", bank: "100.00" }, ...head(60) }, { ...defaults, bank: "1-1100" });
  ok("core: a chosen payment journal supplies the bank account", b.ok && b.entry.lines.find((l) => l.role === "bank").account === "1-1100");
}
more.forEach(([ref, ev, amt, total], i) => {
  const r = post(ev, amt, 40 + i);
  ok(`core: ${ref} replays through ${ev}`, r.ok && r.total === total, JSON.stringify(r.errors ?? r.total));
});
{
  const replayed = new Set([...replay.map((r) => r[0]), ...more.map((r) => r[1])]);
  const missing = Object.keys(core.EVENTS).filter((e) => !replayed.has(e));
  ok(`core: all ${Object.keys(core.EVENTS).length} events are replayed from a worked entry`, missing.length === 0, missing.join(", "));
  ok("core: every event names the worked entry it reproduces", Object.values(core.EVENTS).every((s) => /^[A-Z]{1,2}\d/.test(s.ref ?? "")));
  const dup = Object.entries(core.EVENTS).filter(([, s]) => new Set([...s.debit, ...s.credit]).size !== s.debit.length + s.credit.length).map(([k]) => k);
  ok("core: no event puts one role on both sides", dup.length === 0, dup.join(", "));
}
// tax amounts: A1 PPN is 12% x 11/12 of DPP 95,000,000; P2 PPh 23 is 2% of 40,000,000
ok("core: percentOf gives A1's PPN", core.percentOf("95000000.00", 12n * 11n, 100n * 12n) === "10450000.00");
ok("core: percentOf gives P2's PPh 23", core.percentOf("40000000.00", 2n, 100n) === "800000.00");
ok("core: percentOf rounds half up", core.percentOf("0.05", 1n, 2n) === "0.03" && core.percentOf("0.04", 1n, 2n) === "0.02");
// the rules it must refuse
const bad = (name, r, re) => ok(`core refuses: ${name}`, !r.ok && r.errors.some((e) => re.test(e)), JSON.stringify(r.errors));
bad("an unbalanced entry", post("sale_invoice", { receivable: "100.00", sales: "90.00" }, 20), /does not balance/);
bad("a float amount", post("sale_cogs", { cogs: 0.1, inventory: "0.10" }, 21), /decimal string/);
bad("more than two decimals", post("sale_cogs", { cogs: "1.001", inventory: "1.00" }, 22), /decimal places/);
bad("a role with no configured account", core.buildEntry({ event_type: "sale_cogs", amounts: { cogs: "1.00", inventory: "1.00" }, ...head(23) }, { cogs: "5-0000" }), /no account configured/);
bad("an unknown event", core.buildEntry({ event_type: "nope", amounts: {}, ...head(24) }, defaults), /unknown event_type/);
bad("a role outside the event", post("sale_cogs", { cogs: "1.00", inventory: "1.00", bank: "1.00" }, 25), /not part of event/);
bad("a missing idempotency key", core.buildEntry({ event_type: "sale_cogs", amounts: { cogs: "1.00", inventory: "1.00" }, source_type: "d", source_id: "1" }, defaults), /idempotency_key/);
{
  const b = core.buildEntry({ event_type: "sale_cogs", amounts: { cogs: "1.00", inventory: "1.00" }, ...head(26), posting_date: "2025-12-31" }, defaults);
  bad("a closed period", core.validateEntry(b.entry, ctx), /period is closed/);
  const c = core.buildEntry({ event_type: "sale_cogs", amounts: { cogs: "1.00", inventory: "1.00" }, ...head(27) }, defaults);
  bad("maker approving their own entry", core.validateEntry({ ...c.entry, approved_by: 1 }, ctx), /approver must differ/);
  bad("an inactive account", core.validateEntry(c.entry, { ...ctx, accounts: { ...accounts, "5-0000": { active: false, postable: true } } }), /inactive/);
  bad("a manual posting to a control account", core.validateEntry({ ...c.entry, source_type: undefined }, ctx), /control account/);
  bad("a line with both sides", core.validateEntry({ ...c.entry, lines: c.entry.lines.map((l) => ({ ...l, debit: "1.00", credit: "1.00" })) }, ctx), /exactly one/);
}
// exact arithmetic and reversal
ok("core: 0.10 + 0.20 is exactly 0.30", core.fromMinor(core.toMinor("0.10") + core.toMinor("0.20")) === "0.30");
ok("core: amounts above 2^53 stay exact", core.fromMinor(core.toMinor("9007199254740993.01")) === "9007199254740993.01");
{
  const rev = core.reverseEntry(posted[0], { posting_date: "2026-02-01", idempotency_key: "rev1", created_by: 2 });
  const v = core.validateEntry(rev, ctx);
  ok("core: a reversal is a new balanced entry that names the original", v.ok && rev.reverses_entry_number === "JV1" && rev.lines[0].credit === "105450000.00");
  // the original is marked "reversed" after its reversal posts; both must still count
  const tb2 = core.trialBalance([{ ...posted[0], status: "reversed" }, { ...rev, status: "posted" }]);
  ok("core: entry plus its reversal nets every account to zero", tb2.rows.length > 0 && tb2.rows.every((r) => r.debit === "0.00" && r.credit === "0.00"));
  ok("core: a reversed entry stays in the trial balance totals", tb2.total_debit === "210900000.00", tb2.total_debit);
  ok("core: a draft is left out of the trial balance", core.trialBalance([{ ...rev, status: "draft" }]).rows.length === 0);
  let threw = false; try { core.reverseEntry({ ...posted[0], status: "draft" }, {}); } catch { threw = true; }
  ok("core: a draft cannot be reversed", threw);
}
// ---- reports, closing, revaluation, inventory: tied to the worked tie-out ----
const rep = await import(join(skill, "assets", "reports.mjs"));
const pc = await import(join(skill, "assets", "period-close.mjs"));
const inv = await import(join(skill, "assets", "inventory-valuation.mjs"));
{
  // the chart for E1-E19: the template plus the accounts the E series names
  const acc = Object.fromEntries(coa.accounts.map((a) => [a.code, a]));
  Object.assign(acc, {
    "1-1600": { type: "asset", normal_balance: "debit" },        // Sewa Dibayar di Muka
    "6-1100": { type: "expense", normal_balance: "debit" },      // Beban Gaji
    "6-1200": { type: "expense", normal_balance: "debit" },      // Beban Sewa
    "6-1300": { type: "expense", normal_balance: "debit" },      // Beban Penyusutan
    "6-1400": { type: "expense", normal_balance: "debit" },      // Beban Kerugian Piutang
    "6-1500": { type: "expense", normal_balance: "debit" },      // Beban Selisih Persediaan
  });
  const M = (n) => n.toFixed(2);
  const E = [
    ["E1", "2026-01-02", "1-1200", "3-1000", 500e6], ["E2", "2026-01-03", "1-2100", "1-1200", 24e6],
    ["E3", "2026-01-05", "1-1500", "2-1100", 100e6], ["E4", "2026-01-10", "1-1300", "4-1000", 80e6],
    ["E5", "2026-01-10", "5-0000", "1-1500", 50e6], ["E6", "2026-01-20", "1-1200", "1-1300", 30e6],
    ["E7", "2026-01-22", "2-1100", "1-1200", 40e6], ["E8", "2026-01-02", "1-1600", "1-1200", 12e6],
    ["E9", "2026-01-15", "1-1200", "2-1300", 5e6], ["E10", "2026-01-25", "6-1100", "1-1200", 15e6],
    ["E11", "2026-01-31", "6-1200", "1-1600", 1e6], ["E12", "2026-01-31", "6-1300", "1-2190", 0.5e6],
    ["E13", "2026-01-31", "6-1100", "2-1200", 3e6], ["E14", "2026-01-31", "2-1300", "4-2000", 2e6],
    ["E15", "2026-01-31", "6-1400", "1-1310", 1e6], ["E16", "2026-01-31", "6-1500", "1-1500", 0.5e6],
  ].map(([n, d, dr, cr, amt]) => ({ entry_number: n, status: "posted", posting_date: d, source_type: "doc", source_id: n,
    lines: [{ account: dr, debit: M(amt), credit: "0.00", party: dr === "1-1300" ? "C1" : undefined },
            { account: cr, debit: "0.00", credit: M(amt), party: cr === "1-1300" ? "C1" : undefined }] }));
  const span = { from: "2026-01-01", to: "2026-12-31" };

  const tb = core.trialBalance(E);
  ok("reports: the adjusted trial balance is 649,500,000 each side (E1-E16)",
    tb.rows.reduce((s, r) => s + core.toMinor(r.debit), 0n) === 64950000000n && tb.balanced);
  const is = rep.incomeStatement(E, acc, span);
  ok("reports: revenue 82,000,000, cost of sales 50,000,000, profit 11,000,000",
    is.totals.revenue === "82000000.00" && is.totals.cogs === "50000000.00" && is.totals.net_profit === "11000000.00", JSON.stringify(is.totals));
  const bs = rep.balanceSheet(E, acc, { to: "2026-01-31", fiscalYearStart: "2026-01-01" });
  ok("reports: total assets 577,000,000 = liabilities 66,000,000 + equity 511,000,000",
    bs.totals.assets === "577000000.00" && bs.totals.liabilities === "66000000.00" && bs.totals.equity === "511000000.00" && bs.balanced, JSON.stringify(bs.totals));
  const cf = rep.cashFlowIndirect(E, acc, span);
  ok("reports: operating cash flow is (32,000,000)", cf.operating === "-32000000.00", cf.operating);
  ok("reports: investing (24,000,000), financing 500,000,000", cf.investing === "-24000000.00" && cf.financing === "500000000.00", `${cf.investing} / ${cf.financing}`);
  ok("reports: net cash flow 444,000,000 equals the movement in Bank", cf.net_change === "444000000.00" && cf.ties, `${cf.net_change} / ${cf.cash_change}`);

  // year-end close, E17-E19
  const close = pc.closingEntries(E, acc, { fiscalYearStart: "2026-01-01", fiscalYearEnd: "2026-12-31", incomeSummary: "9-0000", retainedEarnings: "3-3000", created_by: 1 });
  const tot = (e) => e.lines.reduce((s, l) => s + core.toMinor(l.debit), 0n);
  ok("close: three entries, 82,000,000 / 71,000,000 / 11,000,000 (E17-E19)",
    close.entries.length === 3 && tot(close.entries[0]) === 8200000000n && tot(close.entries[1]) === 7100000000n && tot(close.entries[2]) === 1100000000n,
    close.entries.map(tot).join(" / "));
  ok("close: every closing entry passes validateEntry", close.entries.every((e) =>
    core.validateEntry(e, { accounts: Object.fromEntries(Object.keys(acc).map((c) => [c, { active: true, postable: true, control: false }])), isPeriodOpen: () => true }).ok));
  const closed = [...E, ...close.entries.map((e, i) => ({ ...e, status: "posted", entry_number: "CL" + i }))];
  const post = core.trialBalance(closed).rows.filter((r) => r.debit !== "0.00" || r.credit !== "0.00");
  ok("close: the post-closing trial balance is 578,500,000 with only permanent accounts",
    post.reduce((s, r) => s + core.toMinor(r.debit), 0n) === 57850000000n && post.every((r) => !["revenue", "expense", "temporary"].includes(acc[r.account].type)));
  ok("close: the closed year's statement still shows profit 11,000,000", rep.incomeStatement(closed, acc, span).totals.net_profit === "11000000.00");
  const bs2 = rep.balanceSheet(closed, acc, { to: "2026-12-31", fiscalYearStart: "2026-01-01" });
  ok("close: after closing, profit sits in retained earnings and the position still balances",
    bs2.balanced && bs2.current_year_earnings === "0.00" && bs2.equity.some((x) => x.account === "3-3000" && x.amount === "11000000.00"));
  ok("close: closing entries are left out of the cash flow", rep.cashFlowIndirect(closed, acc, span).operating === "-32000000.00");

  // opening balances, E22
  const open = pc.openingEntry([{ account: "1-1200", debit: "100000000.00" }, { account: "1-1300", debit: "50000000.00", party: "C1" },
    { account: "1-1500", debit: "70000000.00" }, { account: "1-2100", debit: "80000000.00" }, { account: "2-1100", credit: "60000000.00" },
    { account: "3-1000", credit: "150000000.00" }, { account: "3-3000", credit: "90000000.00" }], { date: "2026-01-01", created_by: 1 });
  ok("opening: E22 makes one balanced entry of 300,000,000", tot(open) === 30000000000n);
  let threw = false; try { pc.openingEntry([{ account: "1-1200", debit: "1.00" }], { date: "2026-01-01" }); } catch { threw = true; }
  ok("opening: unbalanced opening balances are refused, not parked in suspense", threw);

  // FX revaluation, C5
  const fx = pc.fxRevaluation({ account: "1-1210", foreign: "10000.00", book: "155000000.00", rate: "15800", posting_date: "2026-01-31", idempotency_key: "fx1", created_by: 1 });
  ok("fx: USD 10,000 from 15,500 to 15,800 is a gain of 3,000,000 (C5)", fx.event_type === "fx_revaluation_gain" && fx.amounts.revalued_account === "3000000.00" && fx.restated === "158000000.00");
  const fx2 = pc.fxRevaluation({ account: "1-1210", foreign: "10000.00", book: "158000000.00", rate: "15500.00", posting_date: "2026-02-28", idempotency_key: "fx2", created_by: 1 });
  ok("fx: the move back is a loss of 3,000,000", fx2.event_type === "fx_revaluation_loss" && fx2.amounts.fx_unrealised_gain_loss === "3000000.00");
  ok("fx: no movement, no entry", pc.fxRevaluation({ account: "x", foreign: "1.00", book: "15800.00", rate: "15800", posting_date: "2026-01-31" }) === null);
  const b = core.buildEntry({ ...fx, idempotency_key: "fx1" }, { ...defaults, revalued_account: "1-1200", fx_unrealised_gain_loss: "7-0000" });
  ok("fx: the request posts through the core", b.ok && core.validateEntry(b.entry, ctx).ok);

  // inventory, I1
  const ma = inv.createValuation("moving_average", { decimals: 0 });
  ma.receive("100", "1000000.00"); ma.receive("50", "600000.00");
  ok("inventory: average after the second receipt is 10,666.67 (I1)", ma.position().unit_cost === "10666.67");
  const c1 = ma.issue("80");
  ma.receive("30", "390000.00");
  ok("inventory: issuing 80 costs 853,333 (I1)", c1 === "853333.00", c1);
  ok("inventory: average after buying 30 at 13,000 is 11,366.67 (I1)", ma.position().unit_cost === "11366.67", ma.position().unit_cost);
  const c2 = ma.issue("40");
  ok("inventory: issuing 40 more costs 454,667 (I1)", c2 === "454667.00", c2);
  ok("inventory: the value left equals receipts less issues", ma.position().value === "682000.00" && ma.position().on_hand === "60");
  const ff = inv.createValuation("fifo");
  ff.receive("100", "1000000.00"); ff.receive("50", "600000.00");
  const f1 = ff.issue("80"); ff.receive("30", "390000.00"); const f2 = ff.issue("40");
  ok("inventory: FIFO takes the oldest layers: 800,000 then 200,000 + 240,000", f1 === "800000.00" && f2 === "440000.00", `${f1} / ${f2}`);
  let over = false; try { ff.issue("1000"); } catch { over = true; }
  ok("inventory: issuing more than is on hand is refused", over);

  // open items and aging
  const lines = [
    { entry_number: "PJ1", status: "posted", posting_date: "2026-01-10", due_date: "2026-02-09", source_id: "INV1", lines: [{ account: "1-1300", party: "C1", debit: "105450000.00", credit: "0.00" }] },
    { entry_number: "KM1", status: "posted", posting_date: "2026-02-01", source_id: "RCV1", lines: [{ account: "1-1200", debit: "50000000.00", credit: "0.00" }, { account: "1-1300", party: "C1", debit: "0.00", credit: "50000000.00" }] },
    { entry_number: "KM2", status: "posted", posting_date: "2026-02-05", source_id: "RCV2", lines: [{ account: "1-1300", party: "C2", debit: "0.00", credit: "10000000.00" }] },
  ];
  const oi = rep.openItems(lines, { account: "1-1300", allocations: [{ debit: "PJ1#0", credit: "KM1#1", amount: "50000000.00" }] });
  ok("open items: a part payment leaves 55,450,000 open on the invoice", oi.find((x) => x.key === "PJ1#0")?.open === "55450000.00");
  ok("open items: an unallocated payment stays open as a credit", oi.find((x) => x.key === "KM2#0")?.open === "-10000000.00" && !oi.some((x) => x.key === "KM1#1"));
  let bad = false; try { rep.openItems(lines, { account: "1-1300", allocations: [{ debit: "PJ1#0", credit: "KM2#0", amount: "20000000.00" }] }); } catch { bad = true; }
  ok("open items: allocating more than a payment holds is refused", bad);
  const ag = rep.aging([
    { party: "A", due_date: "2026-04-10", open: "100.00" }, { party: "A", due_date: "2026-03-15", open: "200.00" },
    { party: "B", due_date: "2026-01-10", open: "300.00" }, { party: "B", due_date: "2025-11-01", open: "400.00" },
  ], { asOf: "2026-03-31" });
  ok("aging: current, 1-30, 61-90 and over 90 land in their buckets",
    ag.total.current === "100.00" && ag.total["1-30"] === "200.00" && ag.total["61-90"] === "300.00" && ag.total.over_90 === "400.00", JSON.stringify(ag.total));

  // the dashboard, from nothing but the ledger
  const k = rep.kpis(E, acc, { asOf: "2026-01-31", fiscalYearStart: "2026-01-01", periodStart: "2026-01-01" });
  ok("dashboard: cash 444,000,000, receivables 50,000,000, payables 60,000,000",
    k.cash_and_bank === "444000000.00" && k.receivables === "50000000.00" && k.payables === "60000000.00", JSON.stringify(k));
  ok("dashboard: revenue 82,000,000, profit 11,000,000, gross margin 39.02%",
    k.revenue_ytd === "82000000.00" && k.net_profit_ytd === "11000000.00" && k.gross_margin_pct === "39.02", JSON.stringify(k));
}

// ---- the posting service, through the in-memory repository ----
{
  const svcMod = await import(join(skill, "assets", "posting-service.mjs"));
  const accts = Object.fromEntries([...coa.accounts.map((a) => [a.code, a.control ?? null]), ["2-1150", null], ["2-1410", null], ["1-1750", null], ["6-2000", null]]
    .map(([c, control]) => [c, { active: true, postable: true, control }]));
  const repo = svcMod.createMemoryRepository({ accounts: accts, defaults, periods: { "2026-01": "open", "2026-02": "closed", "2026-03": "open" } });
  const svc = svcMod.createPostingService({ repo });
  const req = (key, date = "2026-01-15", extra = {}) => ({ event_type: "sale_invoice", idempotency_key: key, source_type: "crm_invoice", source_id: key,
    posting_date: date, document_date: date, created_by: 7, party: "CUST-9", dimensions: { analytic_ref: "VOY-014" },
    amounts: { receivable: "105450000.00", sales: "95000000.00", tax_output_ppn: "10450000.00" }, ...extra });
  const o = { company_id: 1, journal_code: "PJ" };
  const r1 = await svc.post(req("INV-1"), o);
  ok("service: a CRM invoice posts as PJ/2026/0001", r1.ok && r1.entry_number === "PJ/2026/0001", JSON.stringify(r1));
  const stored = repo.db.entries[0];
  ok("service: the customer is on the receivable line and the voyage on every line",
    stored.lines.find((l) => l.account === "1-1300").party === "CUST-9" && stored.lines.every((l) => l.analytic_ref === "VOY-014"));
  const r2 = await svc.post(req("INV-1"), o);
  ok("service: the same request again returns the first entry", r2.ok && r2.replay && r2.entry_id === r1.entry_id && repo.db.entries.length === 1);
  const [c1, c2] = await Promise.all([svc.post(req("INV-2"), o), svc.post(req("INV-2"), o)]);
  ok("service: two requests racing with one key post once", c1.ok && c2.ok && c1.entry_id === c2.entry_id && repo.db.entries.length === 2);
  const closed = await svc.post(req("INV-3", "2026-02-10"), o);
  ok("service: a closed period is refused", !closed.ok && /period is closed/.test(closed.errors.join()));
  const r3 = await svc.post(req("INV-4"), o);
  ok("service: the refusal consumed no number: next is PJ/2026/0003", r3.entry_number === "PJ/2026/0003", r3.entry_number);
  const norole = await svc.post({ ...req("INV-5"), event_type: "demurrage_claim", amounts: { contract_asset: "1.00", demurrage_revenue: "1.00" } },
    { ...o, roles: { demurrage_revenue: undefined } });
  ok("service: a role with no account is refused", !norole.ok && /no account configured/.test(norole.errors.join()), JSON.stringify(norole));
  const chosen = await svc.post({ ...req("RCV-1"), event_type: "receipt_in", amounts: { bank: "105450000.00", receivable: "105450000.00" } },
    { company_id: 1, journal_code: "BCA", roles: { bank: "1-1100" } });
  ok("service: a chosen payment journal posts to its own account and numbers in its own journal",
    chosen.entry_number === "BCA/2026/0001" && repo.db.entries.at(-1).lines.some((l) => l.account === "1-1100" && l.debit === "105450000.00"));
  const rv = await svc.reverse({ company_id: 1, entry_id: r1.entry_id, posting_date: "2026-03-01", created_by: 8 });
  ok("service: a reversal is a new entry and the original is marked reversed",
    rv.ok && rv.entry_number === "PJ/2026/0004" && repo.db.entries.find((e) => e.entry_id === r1.entry_id).status === "reversed");
  const rv2 = await svc.reverse({ company_id: 1, entry_id: r1.entry_id, posting_date: "2026-03-01", created_by: 8 });
  ok("service: an entry already reversed is not reversed twice", !rv2.ok);
  ok("service: everything stored still balances", core.trialBalance(repo.db.entries).balanced);

  // the outbox: the module queues inside its own transaction, the worker posts
  ok("outbox: a request with no idempotency key is refused", (() => { try { svcMod.outboxRow(1, { event_type: "x" }); return false; } catch { return true; } })());
  await repo.enqueue(svcMod.outboxRow(1, req("INV-10")));
  await repo.enqueue(svcMod.outboxRow(1, req("INV-11", "2026-02-20")));
  ok("outbox: queuing the same request twice keeps one row", (await repo.enqueue(svcMod.outboxRow(1, req("INV-10")))) === false && repo.db.requests.length === 2);
  const first = await svc.drainOutbox({ company_id: 1, journalFor: () => "PJ" });
  ok("outbox: the worker posts what it can and records why the rest failed",
    first.filter((x) => x.ok).length === 1 && repo.db.requests[1].status === "failed" && /period is closed/.test(repo.db.requests[1].last_error));
  repo.db.periods["2026-02"] = "open";
  const second = await svc.drainOutbox({ company_id: 1, journalFor: () => "PJ" });
  ok("outbox: after the period is opened the retry posts, and nothing posted twice",
    second.length === 1 && second[0].ok && repo.db.requests.every((r) => r.status === "posted") && repo.db.entries.filter((e) => e.idempotency_key === "INV-10").length === 1);
}

// the schema carries what the guide says it does
const prisma = readFileSync(join(skill, "assets", "ledger-schema.prisma"), "utf8");
for (const t of ["T_M_ACC_ACCOUNT", "T_M_ACC_DEFAULT_ACCOUNT", "T_M_ACC_PERIOD", "T_M_ACC_SEQUENCE", "T_L_ACC_JOURNAL_ENTRY", "T_L_ACC_JOURNAL_LINE",
                 "T_M_ACC_CASHBANK", "T_M_ACC_TAX_CODE", "T_L_ACC_ALLOCATION", "T_L_ACC_BANK_STATEMENT", "T_L_ACC_BANK_RECON",
                 "T_L_ACC_POSTING_REQUEST", "T_M_ACC_FIXED_ASSET"])
  ok(`schema: model ${t} exists`, new RegExp(`^model ${t} \\{`, "m").test(prisma));
ok("schema: money columns are DECIMAL(18, 2), never Float", /debit\s+Decimal .*@db\.Decimal\(18, 2\)/.test(prisma) && !/\bFloat\b/.test(prisma));
ok("schema: idempotency key is unique per company", /@@unique\(\[company_id, idempotency_key\]/.test(prisma));
ok("schema: entry number is unique per journal", /@@unique\(\[company_id, journal_code, entry_number\]/.test(prisma));
ok("schema: account types match the chart template", [...TYPES].every((t) => new RegExp(`^  ${t}$`, "m").test(prisma)));


// ---- rates are never stated without the re-verify table ---------------------
ok("values-to-verify.md carries a date", /\b20\d\d\b/.test(readFileSync(join(refs, "values-to-verify.md"), "utf8")));

console.log(`\naccounting  ${pass}/${pass + fail}   (${entries} worked entries re-added)`);
process.exit(fail ? 1 : 0);
