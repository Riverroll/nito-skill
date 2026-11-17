// Payroll calculation for Indonesia: BPJS, PPh 21 (TER monthly, Pasal 17 in
// the last period), net pay, and the amounts for the payroll_accrual event.
// Rules: references/payroll.md. Every rate, cap and table is a parameter
// (assets/payroll-params-id.json, or T_M_ACC_PAYROLL_PARAM rows); nothing is
// hard-coded here. Several parameters are UNVERIFIED or in conflict between
// sources: check each against the current regulation and edit the parameter,
// never this file.
//
//   import { resolveParams, monthlyPayroll, annualPph21, accrualAmounts } from "./payroll-calc.mjs";
//   import file from "./payroll-params-id.json" with { type: "json" };
//   const p = resolveParams(file.sets, "2026-01-31");
//   const r = monthlyPayroll({ ptkp_status: "TK/0", wage: "8000000.00" }, p);
//   // r.pph21 "125448.00", r.net "7554552.00"
//   service.post({ event_type: "payroll_accrual", amounts: accrualAmounts([r]), ... });
import { toMinor, fromMinor } from "./posting-core.mjs";

// ---- parameters: a list of sets, each with effective_from and only the keys
// that change. The set in force on a date is every earlier set merged in date
// order, so a new rate is one new set (or one new row), never an edit of the past.
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
}
export function resolveParams(sets, date) {
  const live = sets.filter((s) => s.effective_from <= date).sort((x, y) => (x.effective_from < y.effective_from ? -1 : 1));
  if (!live.length) throw new Error(`no payroll parameters in force on ${date}`);
  const { effective_from, ...first } = live[0];
  return live.slice(1).reduce((acc, { effective_from: _e, ...s }) => merge(acc, s), first);
}

// Rows from T_M_ACC_PAYROLL_PARAM: { param_key: "bpjs.jp_cap", param_value: '"10547000"', effective_from }.
// param_value is JSON, so a TER table is one row.
export function setsFromRows(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const d = typeof r.effective_from === "string" ? r.effective_from.slice(0, 10) : r.effective_from.toISOString().slice(0, 10);
    const set = byDate.get(d) ?? byDate.set(d, { effective_from: d }).get(d);
    const path = r.param_key.split(".");
    let node = set;
    for (const k of path.slice(0, -1)) node = node[k] ??= {};
    node[path.at(-1)] = JSON.parse(r.param_value);
  }
  return [...byDate.values()];
}

// ---- money: BigInt minor units; rates are percent strings ("3.7" = 3.7%).
function pct(minor, rate) {
  const [i, f = ""] = String(rate).split(".");
  const num = BigInt(i + f), den = 100n * 10n ** BigInt(f.length);
  return (minor * num * 2n + den) / (den * 2n); // half-up; ponytail: rounding rule unverified (values-to-verify.md)
}
const min = (a, b) => (a < b ? a : b);
const capOf = (v) => (v === null || v === undefined ? null : toMinor(v));
const capped = (base, cap) => (cap === null ? base : min(base, cap));

function terRate(gross, table) {
  for (const [upTo, rate] of table) if (upTo === null || gross <= toMinor(upTo)) return rate;
  throw new Error("TER table has no open last bracket");
}

export function ptkpOf(status, p) {
  const m = /^(TK|K)\/([0-3])$/.exec(status);
  if (!m) throw new Error(`unknown PTKP status "${status}"`);
  const deps = BigInt(Math.min(Number(m[2]), p.ptkp.max_dependents));
  return toMinor(p.ptkp.base) + (m[1] === "K" ? toMinor(p.ptkp.married) : 0n) + deps * toMinor(p.ptkp.per_dependent);
}

// One employee, one month (January to November, or a leaver's month before the
// annual calculation). wage = fixed wage, the BPJS base; variable_pay =
// overtime, THR, bonus: taxable, outside the BPJS base. jkk_rate overrides the
// company's JKK class rate (take it from the BPJS invoice).
export function monthlyPayroll({ ptkp_status, wage, variable_pay = "0", jkk_rate }, p) {
  const b = p.bpjs, w = toMinor(wage), v = toMinor(variable_pay);
  const jpBase = capped(w, capOf(b.jp_cap)), kesBase = capped(w, capOf(b.kes_cap));
  const employer = {
    jkk: pct(w, jkk_rate ?? b.jkk_er), jkm: pct(w, b.jkm_er),
    jht: pct(w, b.jht_er), jp: pct(jpBase, b.jp_er), kes: pct(kesBase, b.kes_er),
  };
  const employee = { jht: pct(w, b.jht_ee), jp: pct(jpBase, b.jp_ee), kes: pct(kesBase, b.kes_ee) };
  const sum = (o) => Object.values(o).reduce((a, x) => a + x, 0n);
  const gross = w + v + p.ter_gross_includes.reduce((a, k) => a + employer[k], 0n);
  const category = p.ter_category[ptkp_status];
  if (!category) throw new Error(`no TER category for "${ptkp_status}"`);
  const rate = terRate(gross, p.ter[category]);
  const pph21 = pct(gross, rate);
  const net = w + v - sum(employee) - pph21;
  const s = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fromMinor(x)]));
  return {
    ptkp_status, ter_category: category, ter_rate: rate,
    wage: fromMinor(w), variable_pay: fromMinor(v), gross_taxable: fromMinor(gross),
    employer: { ...s(employer), total: fromMinor(sum(employer)) },
    employee: { ...s(employee), total: fromMinor(sum(employee)) },
    pph21: fromMinor(pph21), net: fromMinor(net),
  };
}

// Last period (December, or the month an employee leaves): full-year Pasal 17
// less tax already withheld. due < 0 means over-withheld, owed back to the employee.
// pension_year = employee JHT + JP for the year (deductible); health is not.
export function annualPph21({ ptkp_status, gross_year, pension_year, withheld }, p) {
  const g = toMinor(gross_year);
  const bj = min(pct(g, p.biaya_jabatan.rate), toMinor(p.biaya_jabatan.max_year));
  const net = g - bj - toMinor(pension_year);
  const ptkp = ptkpOf(ptkp_status, p);
  const step = toMinor(p.pkp_round_down_to);
  let pkp = net > ptkp ? net - ptkp : 0n;
  pkp -= pkp % step;
  let tax = 0n, floor = 0n;
  for (const [upTo, rate] of p.pasal17) {
    const top = upTo === null ? pkp : min(pkp, toMinor(upTo));
    if (top > floor) tax += pct(top - floor, rate);
    if (upTo === null || pkp <= toMinor(upTo)) break;
    floor = toMinor(upTo);
  }
  const due = tax - toMinor(withheld);
  return {
    biaya_jabatan: fromMinor(bj), net_year: fromMinor(net), ptkp: fromMinor(ptkp), pkp: fromMinor(pkp),
    tax_year: fromMinor(tax), withheld: fromMinor(toMinor(withheld)),
    due: due < 0n ? "-" + fromMinor(-due) : fromMinor(due),
  };
}

// Sums a payroll run into the amounts of one payroll_accrual request (PY1).
export function accrualAmounts(results) {
  const t = { salary: 0n, er: 0n, net: 0n, emp: 0n, kes: 0n, pph: 0n };
  for (const r of results) {
    t.salary += toMinor(r.wage) + toMinor(r.variable_pay);
    t.er += toMinor(r.employer.total);
    t.net += toMinor(r.net);
    t.emp += toMinor(r.employer.jkk) + toMinor(r.employer.jkm) + toMinor(r.employer.jht) + toMinor(r.employer.jp)
      + toMinor(r.employee.jht) + toMinor(r.employee.jp);
    t.kes += toMinor(r.employer.kes) + toMinor(r.employee.kes);
    t.pph += toMinor(r.pph21);
  }
  return {
    salary_expense: fromMinor(t.salary), employer_bpjs_expense: fromMinor(t.er),
    payroll_payable: fromMinor(t.net), bpjs_employment_payable: fromMinor(t.emp),
    bpjs_health_payable: fromMinor(t.kes), wht_payable_21: fromMinor(t.pph),
  };
}
