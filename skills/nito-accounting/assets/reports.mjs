// Reports read from the ledger, never from module tables: the statements, the
// cash flow, open items and aging, and the numbers a dashboard shows. Pure
// functions over posted entries, so the same code serves a full ERP and a CRM
// that only issues invoices. test/accounting.mjs ties every figure to the
// worked tie-out in references/close-and-statements.md (E1-E19).
//
// Inputs
//   entries:  journal entries as posting-core builds them; status "posted" and
//             "reversed" count, drafts never do
//   accounts: { code: { type, normal_balance, control?, cash_flow?, pl?, closing_only? } }
//     cash_flow: "cash" | "investing" | "financing" | "profit"  (default by type)
//     pl:        "cogs" | "other" | "income_tax"                 (default by type)
// Amounts come back as decimal strings, like everything else at a boundary.
import { toMinor, fromMinor } from "./posting-core.mjs";

const S = (m) => (m < 0n ? "-" + fromMinor(-m) : fromMinor(m));
const counts = (e) => e.status === "posted" || e.status === "reversed";

// dr - cr per account over [from, to], both optional and inclusive.
export function balances(entries, { from, to, exclude } = {}) {
  const out = new Map();
  for (const e of entries) {
    if (!counts(e) || (from && e.posting_date < from) || (to && e.posting_date > to) || exclude?.(e)) continue;
    for (const l of e.lines) out.set(l.account, (out.get(l.account) ?? 0n) + toMinor(l.debit) - toMinor(l.credit));
  }
  return out;
}

const PL_TYPES = new Set(["revenue", "contra_revenue", "expense", "temporary"]);
const isClosing = (e) => e.source_type === "year_end_close";

function plGroup(a) {
  if (a.pl) return a.pl;
  if (a.type === "revenue" || a.type === "contra_revenue") return "revenue";
  if (a.type === "temporary") return "other";
  return "operating_expenses";
}

// Profit or loss for a period. Closing entries are left out, so the statement
// for a closed year still shows the year's figures.
export function incomeStatement(entries, accounts, { from, to } = {}) {
  const bal = balances(entries, { from, to, exclude: isClosing });
  const lines = [], t = { revenue: 0n, cogs: 0n, operating_expenses: 0n, other: 0n, income_tax: 0n };
  for (const [code, m] of [...bal].sort(([a], [b]) => a.localeCompare(b))) {
    const a = accounts[code];
    if (!a || !PL_TYPES.has(a.type) || a.closing_only || m === 0n) continue;
    const g = plGroup(a);
    // revenue and other income read as positive credits, costs as positive debits
    const v = g === "revenue" || g === "other" ? -m : m;
    t[g] += v;
    lines.push({ group: g, account: code, amount: S(v) });
  }
  const gross = t.revenue - t.cogs, net = gross - t.operating_expenses + t.other - t.income_tax;
  return { lines, totals: { revenue: S(t.revenue), cogs: S(t.cogs), gross_profit: S(gross),
    operating_expenses: S(t.operating_expenses), other: S(t.other), income_tax: S(t.income_tax), net_profit: S(net) } };
}

// Position at a date. Until the year is closed, the year's profit sits in the
// P&L accounts; it is shown as current-year earnings so the statement balances.
export function balanceSheet(entries, accounts, { to, fiscalYearStart }) {
  const bal = balances(entries, { to });
  const g = { assets: [], liabilities: [], equity: [] }, t = { assets: 0n, liabilities: 0n, equity: 0n };
  for (const [code, m] of [...bal].sort(([a], [b]) => a.localeCompare(b))) {
    const a = accounts[code];
    if (!a || m === 0n || PL_TYPES.has(a.type)) continue;
    const key = ["asset", "contra_asset", "suspense"].includes(a.type) ? "assets" : a.type === "liability" ? "liabilities" : "equity";
    const v = key === "assets" ? m : -m;
    t[key] += v; g[key].push({ account: code, amount: S(v) });
  }
  const profit = toMinor0(incomeStatement(entries.filter((e) => !isClosing(e)), accounts, { from: fiscalYearStart, to }).totals.net_profit);
  // after the closing entries the P&L accounts are zero and this is zero too
  const open = [...balances(entries, { from: fiscalYearStart, to })].some(([c, m]) => m !== 0n && PL_TYPES.has(accounts[c]?.type) && !accounts[c]?.closing_only);
  const current = open ? profit : 0n;
  t.equity += current;
  return { ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v])), current_year_earnings: S(current),
    totals: { assets: S(t.assets), liabilities: S(t.liabilities), equity: S(t.equity), liabilities_and_equity: S(t.liabilities + t.equity) },
    balanced: t.assets === t.liabilities + t.equity };
}
function toMinor0(s) { return s.startsWith("-") ? -toMinor(s.slice(1)) : toMinor(s); }

function cfClass(a) {
  if (a.cash_flow) return a.cash_flow;
  return a.type === "equity" || a.type === "contra_equity" ? "financing" : "operating";
}

// Indirect method (IAS 7.18): profit, then the movement of every non-cash
// balance-sheet account, classed operating, investing or financing by the
// account's cash_flow flag. Contra accounts (accumulated depreciation, credit
// loss allowance) land in operating, which is the non-cash add-back.
export function cashFlowIndirect(entries, accounts, { from, to }) {
  const live = entries.filter((e) => !isClosing(e));
  const profit = toMinor0(incomeStatement(live, accounts, { from, to }).totals.net_profit);
  const move = balances(live, { from, to });
  const s = { operating: profit, investing: 0n, financing: 0n }, cash = { change: 0n }, items = [];
  for (const [code, m] of move) {
    const a = accounts[code];
    if (!a || PL_TYPES.has(a.type) || m === 0n) continue;
    const c = cfClass(a);
    if (c === "cash") { cash.change += m; continue; }
    if (c === "profit") continue;
    s[c] += -m; items.push({ class: c, account: code, amount: S(-m) });
  }
  const net = s.operating + s.investing + s.financing;
  return { profit: S(profit), items, operating: S(s.operating), investing: S(s.investing), financing: S(s.financing),
    net_change: S(net), cash_change: S(cash.change), ties: net === cash.change };
}

// Open items on a control account: each line with a party, less what has been
// allocated against it. allocations: [{ debit: "EN#i", credit: "EN#j", amount }]
// keyed by entry number and line index. A payment not yet allocated stays open
// as a credit item, as in Odoo's partial reconciliation.
export function openItems(entries, { account, allocations = [] }) {
  const items = new Map();
  for (const e of entries) {
    if (!counts(e)) continue;
    e.lines.forEach((l, i) => {
      if (l.account !== account) return;
      items.set(`${e.entry_number}#${i}`, { key: `${e.entry_number}#${i}`, party: l.party, source: e.source_id, date: e.posting_date,
        due_date: e.due_date ?? e.posting_date, open: toMinor(l.debit) - toMinor(l.credit) });
    });
  }
  for (const a of allocations) {
    const amt = toMinor(a.amount), d = items.get(a.debit), c = items.get(a.credit);
    if (!d || !c) throw new Error(`allocation names a line that is not on ${account}: ${a.debit} / ${a.credit}`);
    if (amt > d.open || amt > -c.open) throw new Error(`allocation of ${a.amount} exceeds what is open on ${a.debit} or ${a.credit}`);
    d.open -= amt; c.open += amt;
  }
  return [...items.values()].filter((x) => x.open !== 0n).map((x) => ({ ...x, open: S(x.open) }));
}

const DAY = 86400000;
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

// Aging by days past due. buckets are the upper edges: [30, 60, 90] gives
// current, 1-30, 31-60, 61-90, over 90.
export function aging(items, { asOf, buckets = [30, 60, 90] }) {
  const names = ["current", ...buckets.map((b, i) => `${i ? buckets[i - 1] + 1 : 1}-${b}`), `over_${buckets.at(-1)}`];
  const rows = new Map();
  for (const it of items) {
    const late = days(it.due_date, asOf), m = toMinor0(it.open);
    let k = 0;
    if (late > 0) { k = buckets.findIndex((b) => late <= b) + 1; if (k === 0) k = names.length - 1; }
    const r = rows.get(it.party) ?? Object.fromEntries(names.map((n) => [n, 0n]));
    r[names[k]] += m; rows.set(it.party, r);
  }
  const total = Object.fromEntries(names.map((n) => [n, 0n]));
  const out = [...rows].map(([party, r]) => { for (const n of names) total[n] += r[n]; return { party, ...Object.fromEntries(names.map((n) => [n, S(r[n])])) }; });
  return { buckets: names, rows: out, total: Object.fromEntries(names.map((n) => [n, S(total[n])])) };
}

// The dashboard. Everything is found by account type and flags, so it works on
// any chart and on a ledger fed by nothing but CRM invoices and receipts.
export function kpis(entries, accounts, { asOf, fiscalYearStart, periodStart }) {
  const bal = balances(entries, { to: asOf });
  let cash = 0n, ar = 0n, ap = 0n;
  for (const [code, m] of bal) {
    const a = accounts[code];
    if (!a) continue;
    if (a.cash_flow === "cash") cash += m;
    if (a.control === "customer") ar += m;
    if (a.control === "supplier") ap -= m;
  }
  const ytd = incomeStatement(entries, accounts, { from: fiscalYearStart, to: asOf }).totals;
  const ptd = incomeStatement(entries, accounts, { from: periodStart, to: asOf }).totals;
  const rev = toMinor0(ytd.revenue), gp = toMinor0(ytd.gross_profit);
  return { cash_and_bank: S(cash), receivables: S(ar), payables: S(ap), revenue_period: ptd.revenue, revenue_ytd: ytd.revenue,
    gross_profit_ytd: ytd.gross_profit, net_profit_ytd: ytd.net_profit,
    gross_margin_pct: rev === 0n ? null : (Number((gp * 10000n) / rev) / 100).toFixed(2) };
}
