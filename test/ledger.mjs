// The showcase ledger, example/ledger/, driven in a real browser.
//
//   node test/ledger.mjs
//
// The page posts through skills/nito-accounting/assets/posting-core.mjs. This
// checks that the example data ties out to the worked entries it is built
// from, that the rules the skill names are refused on screen as well as in the
// core, that every view renders at desktop and phone width, and that the
// nito-design ERP audit has nothing to say about the screen.
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
import os from "node:os"; import { spawn } from "node:child_process";
import { runAudit } from "../tools/audit.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE = "/example/ledger/index.html";
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond });
  console.log(`${cond ? "  ok  " : "FAIL  "}${name}${cond || !detail ? "" : " — " + detail}`);
};

const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const prof = fs.mkdtempSync(os.tmpdir() + "/ledger-");
const port = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); }
}
if (!targets) { console.error("could not start Chrome — set CHROME to its path"); process.exit(1); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors = [];
const call = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
};
await new Promise((r) => (ws.onopen = r));
await call("Runtime.enable"); await call("Page.enable");
const evaluate = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};
const open = async (width = 1440, hash = "") => {
  await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: base + PAGE + hash });
  for (let i = 0; i < 40; i++) { await sleep(100); if (await evaluate("!!window.__ledger?.state")) return; }
  throw new Error("page did not boot");
};

try {
  await open();
  await evaluate("localStorage.clear()");
  await open();
  ok("boots without a script error", errors.length === 0, errors.join(" | "));

  // ---- the example data ties out (amounts from the worked entries A1, A2, P1, P2, F1, F2)
  const n = await evaluate(`(() => {
    const L = window.__ledger, s = L.state, M = L.core.toMinor;
    const bal = (c) => s.entries.filter((e) => e.status !== "draft").flatMap((e) => e.lines).filter((l) => l.account === c)
      .reduce((t, l) => t + M(l.debit) - M(l.credit), 0n).toString();
    return { checks: L.checks().map((c) => [c.name, c.ok]), bank: bal("1-1200"), ar: bal("1-1300"), ap: bal("2-1100"),
      ppnLB: bal("1-1750"), ppnOut: bal("2-1400"), pph23: bal("2-1510"), accdep: bal("1-2190"), grir: bal("2-1150"),
      prepaid: bal("1-1800"), docs: s.docs.length, drafts: s.entries.filter((e) => e.status === "draft").length,
      numbers: s.entries.filter((e) => e.journal === "PJ").map((e) => e.entry_number) };
  })()`);
  for (const [name, pass] of n.checks) ok(`seed: ${name}`, pass);
  ok("seed: bank = 500,000,000 - 88,800,000 + 54,500,000 - 43,600,000 - 800,000", n.bank === "42130000000", n.bank);
  ok("seed: receivable = A1 105,450,000 + 13,875,000 open", n.ar === "11932500000", n.ar);
  ok("seed: payable = the machine bill 142,080,000 (F1)", n.ap === "-14208000000", n.ap);
  ok("seed: January PPN settles to lebih bayar 11,330,000", n.ppnLB === "1133000000", n.ppnLB);
  ok("seed: February output PPN 1,375,000 stays open", n.ppnOut === "-137500000", n.ppnOut);
  ok("seed: PPh 23 withheld 800,000 was remitted", n.pph23 === "0", n.pph23);
  ok("seed: PPh 23 cut by the customer 1,000,000 is prepaid tax (A2)", n.prepaid === "100000000", n.prepaid);
  ok("seed: one month of depreciation 2,000,000 (F2 / 60 months)", n.accdep === "-200000000", n.accdep);
  ok("seed: GR/IR clears (P1)", n.grir === "0");
  ok("seed: no draft left behind", n.drafts === 0);
  ok("seed: sales journal numbers have no gap", n.numbers.join() === "PJ/2026/0001,PJ/2026/0002,PJ/2026/0003,PJ/2026/0004", n.numbers.join());

  // ---- the rules, through the same commands the forms call
  const r = await evaluate(`(() => {
    const L = window.__ledger, s = () => L.state, out = {};
    // a form shows a thrown field error in place; here it becomes a refusal like any other
    const H = new Proxy(L.H, { get: (o, k) => (f) => { try { return o[k](f); } catch (e) { return { ok: false, errors: [e.message] }; } } });
    const t = () => crypto.randomUUID();
    const seq = () => JSON.stringify(s().seq);
    let before = seq();
    out.control = H.manual({ token: t(), date: "2026-03-01", acct_0: "1-1300", dr_0: "100", acct_1: "4-1000", cr_0: "", dr_1: "", cr_1: "100" }).errors?.join();
    out.unbalanced = H.manual({ token: t(), date: "2026-03-01", acct_0: "1-1200", dr_0: "100", cr_0: "", acct_1: "3-1000", dr_1: "", cr_1: "90" }).errors?.join();
    const d = H.manual({ token: t(), date: "2026-03-01", memo: "uji", acct_0: "6-0000", dr_0: "250.000", cr_0: "", acct_1: "1-1200", dr_1: "", cr_1: "250.000" });
    s().user = "rina"; out.selfApprove = H.approve({ key: d.key }).errors?.join();
    s().user = "budi"; out.approved = H.approve({ key: d.key }).ok;
    s().periods["2026-03"] = "closed";
    out.closed = H.sale({ token: t(), kind: "service", party: "C1", date: "2026-03-05", dpp: "1.000.000" }).errors?.join();
    out.gapless = before !== seq() && JSON.parse(seq())["INV-2026"] === JSON.parse(before)["INV-2026"];
    s().periods["2026-03"] = "open";
    const tok = t();
    const a = H.sale({ token: tok, kind: "service", party: "C1", date: "2026-03-05", dpp: "1.000.000" });
    const b = H.sale({ token: tok, kind: "service", party: "C1", date: "2026-03-05", dpp: "1.000.000" });
    out.idempotent = a.ok && b.ok && a.doc.no === b.doc.no && s().docs.filter((x) => x.token === tok).length === 1;
    out.depTwice = H.depreciation({ month: "2026-01" }).errors?.join();
    out.depFeb = H.depreciation({ month: "2026-02" }).ok;
    const inv = s().docs.find((x) => x.kind === "service" && x.party === "C2");
    out.cancelPaid = H.cancel({ no: inv.no, date: "2026-03-10" }).errors?.join();
    out.cancel = H.cancel({ no: a.doc.no, date: "2026-03-10" }).ok;
    const orig = s().entries.find((e) => e.entry_number === a.doc.entries[0]);
    out.origKept = orig.status === "reversed" && !!orig.reversed_by;
    out.tbBalanced = L.core.trialBalance(s().entries).balanced;
    out.over = H.receipt({ token: t(), ref: s().docs.find((x) => x.kind === "sale").no, date: "2026-03-10", bank: "999.999.999" }).errors?.join();
    delete s().defaults.sales;
    out.noRole = H.sale({ token: t(), kind: "sale", party: "C1", date: "2026-03-05", dpp: "1.000.000" }).errors?.join();
    s().defaults.sales = "4-1000";
    out.checks = L.checks().filter((c) => !c.ok).map((c) => c.name);
    return out;
  })()`);
  ok("refuses a manual posting to the receivable control account", /control account/.test(r.control), r.control);
  ok("refuses an unbalanced manual journal", /does not balance/.test(r.unbalanced), r.unbalanced);
  ok("refuses the maker approving their own journal", /approver must differ/.test(r.selfApprove), r.selfApprove);
  ok("a second user approves and posts it", r.approved === true);
  ok("refuses a posting into a closed period", /period is closed/.test(r.closed), r.closed);
  ok("a refused posting consumes no document number", r.gapless === true);
  ok("the same form token twice makes one document", r.idempotent === true);
  ok("running January depreciation again posts nothing", /sudah diposting/.test(r.depTwice), r.depTwice);
  ok("February depreciation posts", r.depFeb === true);
  ok("refuses cancelling an invoice that has a receipt", /Batalkan dulu/.test(r.cancelPaid), r.cancelPaid);
  ok("cancelling a document reverses its journal", r.cancel === true);
  ok("the cancelled journal stays in the ledger, marked reversed", r.origKept === true);
  ok("the trial balance still balances after the reversal", r.tbBalanced === true);
  ok("refuses a receipt above what is owed", /Melebihi sisa/.test(r.over), r.over);
  ok("refuses a posting whose role has no account", /no account configured/.test(r.noRole), r.noRole);
  ok("every subledger still ties to its control account", r.checks.length === 0, r.checks.join());

  // ---- every view renders, at desktop and at phone width
  const views = ["dasbor", "penjualan", "pembelian", "aset", "pajak", "jurnal", "buku-besar", "neraca-saldo", "laporan", "akun", "periode", "konfigurasi"];
  for (const w of [1440, 390]) {
    const bad = [];
    for (const v of views) {
      await evaluate(`location.hash = "${v}"`); await sleep(60);
      const s = await evaluate(`({ h1: document.querySelector("h1")?.textContent, over: document.documentElement.scrollWidth - innerWidth,
        wide: [...document.querySelectorAll(".tw")].filter((t) => t.scrollWidth > t.clientWidth + 1)
          .map((t) => (t.querySelector("th")?.textContent ?? "?") + " +" + (t.scrollWidth - t.clientWidth) + "px").join(", "),
        clipped: [...document.querySelectorAll(".toolbar *, .panel")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length })`);
      if (!s.h1 || s.over > 0) bad.push(`${v}: ${s.h1 ? "overflows " + s.over + "px" : "no title"}`);
      if (s.clipped) bad.push(`${v}: ${s.clipped} toolbar or panel element(s) past the right edge`);
      // at desktop width every table fits beside the side column; at phone width tables may scroll inside their box
      if (w === 1440 && s.wide) bad.push(`${v}: ${s.wide} table(s) scroll sideways at 1440px`);
    }
    ok(`all ${views.length} views render at ${w}px without sideways scroll`, bad.length === 0, bad.join("; "));
    if (w === 1440) await open(390);
  }
  ok("no script error while using it", errors.length === 0, errors.join(" | "));

  // ---- clicking a row opens the inspector with the journal lines behind it
  await open(1440, "#penjualan");
  const insp = await evaluate(`(() => {
    const row = document.querySelector('tr[data-act="doc"][data-id="INV/2026/0001"]'); row.click();
    const p = document.querySelector(".side-col .panel");
    return { title: p?.querySelector("h2")?.textContent, id: row.dataset.id, lines: p?.querySelectorAll(".lines table").length,
      cancel: !!document.querySelector('form[data-form="cancel"]') };
  })()`);
  ok("a document row opens its inspector, with its journals and a cancel action",
    insp.title === insp.id && insp.lines >= 1 && insp.cancel, JSON.stringify(insp));

  // ---- the statements on screen agree with each other
  await open(1440, "#laporan");
  const rep = await evaluate(`[...document.querySelectorAll(".badge")].map((b) => b.textContent).join()`);
  ok("the report page shows assets = liabilities + equity", /Aset = L \+ E/.test(rep), rep);
} finally {
  chrome.kill();
}

// ---- the nito-design ERP audit on the dashboard and on a form-and-table screen
for (const hash of ["", "#penjualan", "#jurnal"]) {
  const a = await runAudit(`${base}${PAGE}${hash}`, [1440], "erp");
  ok(`erp audit ${hash || "#dasbor"}: no findings`, a.findings.length === 0, a.findings.map((f) => f.title).join(" | "));
}
server.close();

const passed = checks.filter((c) => c.pass).length;
console.log(`\nledger  ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
