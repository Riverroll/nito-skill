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

// ---- rates are never stated without the re-verify table ---------------------
ok("values-to-verify.md carries a date", /\b20\d\d\b/.test(readFileSync(join(refs, "values-to-verify.md"), "utf8")));

console.log(`\naccounting  ${pass}/${pass + fail}   (${entries} worked entries re-added)`);
process.exit(fail ? 1 : 0);
