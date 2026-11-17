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
                   accumulated_depreciation: "1-2190", depreciation_expense: "6-2000" };
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
];
more.forEach(([ref, ev, amt, total], i) => {
  const r = post(ev, amt, 40 + i);
  ok(`core: ${ref} replays through ${ev}`, r.ok && r.total === total, JSON.stringify(r.errors ?? r.total));
});
ok("core: every event names only roles that have a default account here",
  Object.values(core.EVENTS).every((s) => [...s.debit, ...s.credit].every((r) => defaults[r])));
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
// the schema carries what the guide says it does
const prisma = readFileSync(join(skill, "assets", "ledger-schema.prisma"), "utf8");
for (const t of ["T_M_ACC_ACCOUNT", "T_M_ACC_DEFAULT_ACCOUNT", "T_M_ACC_PERIOD", "T_M_ACC_SEQUENCE", "T_L_ACC_JOURNAL_ENTRY", "T_L_ACC_JOURNAL_LINE"])
  ok(`schema: model ${t} exists`, new RegExp(`^model ${t} \\{`, "m").test(prisma));
ok("schema: money columns are DECIMAL(18, 2), never Float", /debit\s+Decimal .*@db\.Decimal\(18, 2\)/.test(prisma) && !/\bFloat\b/.test(prisma));
ok("schema: idempotency key is unique per company", /@@unique\(\[company_id, idempotency_key\]/.test(prisma));
ok("schema: entry number is unique per journal", /@@unique\(\[company_id, journal_code, entry_number\]/.test(prisma));
ok("schema: account types match the chart template", [...TYPES].every((t) => new RegExp(`^  ${t}$`, "m").test(prisma)));


// ---- rates are never stated without the re-verify table ---------------------
ok("values-to-verify.md carries a date", /\b20\d\d\b/.test(readFileSync(join(refs, "values-to-verify.md"), "utf8")));

console.log(`\naccounting  ${pass}/${pass + fail}   (${entries} worked entries re-added)`);
process.exit(fail ? 1 : 0);
