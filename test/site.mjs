// The landing page, index.html at the repo root.
//
//   node test/site.mjs                 # everything, including re-running the suites it quotes
//   SKIP_SUITES=1 node test/site.mjs   # skip re-running them
//
// Checks that every file the page points at exists, that the live journal is
// the real posting core (worked entry A1, and a refusal when it is broken),
// that the page holds at phone and desktop width with nothing loaded lazily
// left blank, that reduced motion gets the end frame and no clip, that the
// marketing audit has nothing to say, and that each test count the page
// quotes is what that suite prints today.
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
import os from "node:os"; import { spawn, execFileSync } from "node:child_process";
import { runAudit } from "../tools/audit.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond });
  console.log(`${cond ? "  ok  " : "FAIL  "}${name}${cond || !detail ? "" : " — " + detail}`);
};

// ---- every file and anchor the page names exists
const refs = new Set();
for (const m of html.matchAll(/\b(?:href|src|data-src-[a-z]+)="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1].split(",")) refs.add(part.trim().split(/\s+/)[0]);
for (const m of html.matchAll(/import\("(\.[^"]+)"\)|fetch\("(\.[^"]+)"\)/g)) refs.add(m[1] ?? m[2]);
const missing = [];
for (const r of refs) {
  if (/^(https?:|mailto:)/.test(r)) continue;
  if (r.startsWith("#")) { if (!new RegExp(`id="${r.slice(1)}"`).test(html)) missing.push(r); continue; }
  const p = path.join(ROOT, decodeURIComponent(r.split("#")[0]));
  if (!fs.existsSync(p) || (fs.statSync(p).isDirectory() && !fs.existsSync(path.join(p, "index.html")))) missing.push(r);
}
ok(`all ${refs.size} files and anchors the page points at exist`, missing.length === 0, missing.join(", "));
const media = [...refs].filter((r) => r.startsWith("example/media/site/"));
const weight = media.reduce((s, r) => s + fs.statSync(path.join(ROOT, r)).size, 0);
ok("the page's own media weigh under 1.5 MB in total", weight < 1.5e6, `${(weight / 1e6).toFixed(2)} MB`);

// ---- a browser
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".webp": "image/webp", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const prof = fs.mkdtempSync(os.tmpdir() + "/site-");
const port = 9800 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 80; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
if (!targets) { console.error("could not start Chrome — set CHROME to its path"); process.exit(1); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors = [];
const call = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
};
await new Promise((r) => (ws.onopen = r));
await call("Runtime.enable"); await call("Page.enable");
const evaluate = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
};
const open = async (width, { reduced = false } = {}) => {
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: base + "/index.html" });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await evaluate("!!window.__site")) return; }
  throw new Error("page did not boot");
};
// scroll the whole page so every lazy picture is asked for, then come back up
// then wait (up to 8s) for what was asked to arrive, instead of guessing a delay
const scrollThrough = () => evaluate(`(async () => {
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await wait(60); }
  document.querySelector(".clip")?.scrollIntoView({ block: "center" }); await wait(100);
  const pending = () => [...document.images].filter((i) => i.getBoundingClientRect().width > 0 && !(i.complete && i.naturalWidth > 0)).length;
  for (let t = 0; t < 80 && pending(); t++) await wait(100);
  scrollTo(0, 0); })()`);

try {
  await open(1440);
  ok("boots without a script error", errors.length === 0, errors.join(" | "));

  // ---- the live journal is the real core
  const d = await evaluate(`(() => {
    const rows = () => [...document.querySelectorAll("#d-lines tr")].map((r) => [...r.cells].map((c) => c.textContent.trim()).join("|"));
    const out = { a1: rows(), dr: document.getElementById("d-dr").textContent, cr: document.getElementById("d-cr").textContent,
                  badge: document.getElementById("d-badge").textContent };
    document.getElementById("d-break").click();
    out.broken = document.getElementById("d-badge").textContent; out.why = document.getElementById("d-why").textContent;
    document.getElementById("d-break").click();
    const k = document.getElementById("d-kind"); k.value = "service"; k.dispatchEvent(new Event("change", { bubbles: true }));
    const p = document.getElementById("d-pkp"); p.checked = false; p.dispatchEvent(new Event("change", { bubbles: true }));
    out.nonPkp = rows();
    const dpp = document.getElementById("d-dpp"); dpp.value = "12,5x"; dpp.dispatchEvent(new Event("input", { bubbles: true }));
    out.bad = document.getElementById("d-err").textContent;
    return out;
  })()`);
  ok("the demo opens on worked entry A1: receivable 105,450,000", d.a1[0] === "1-1300 Piutang Usaha|105.450.000,00|", d.a1[0]);
  ok("A1: sales 95,000,000 and output PPN 10,450,000", d.a1[1] === "4-1000 Penjualan||95.000.000,00" && d.a1[2] === "2-1400 PPN Keluaran||10.450.000,00", d.a1.join(" / "));
  ok("A1: cost of sales 60,000,000 against inventory", d.a1[3] === "5-0000 Harga Pokok Penjualan (HPP)|60.000.000,00|" && d.a1[4] === "1-1500 Persediaan||60.000.000,00", d.a1.join(" / "));
  ok("the totals match and the core accepts it", d.dr === "165.450.000,00" && d.cr === d.dr && d.badge === "Balanced", `${d.dr} / ${d.cr} / ${d.badge}`);
  ok("one rupiah off and the core refuses it, with its own reason", d.broken === "Refused" && /does not balance/.test(d.why), d.why);
  ok("a company that is not PKP posts no PPN line", d.nonPkp.length === 2 && !d.nonPkp.some((r) => /PPN/.test(r)), d.nonPkp.join(" / "));
  ok("a malformed amount is caught before posting", /Enter an amount/.test(d.bad), d.bad);
  ok("the prompt card quotes the same A1 figures", /Piutang Usaha 105,450,000 against Penjualan 95,000,000 and PPN Keluaran 10,450,000/.test(html));

  // ---- before / after
  const cmp = await evaluate(`(() => { const r = document.querySelector(".compare input"); r.value = 20; r.dispatchEvent(new Event("input"));
    return getComputedStyle(document.querySelector(".compare")).getPropertyValue("--pos").trim(); })()`);
  ok("the before/after slider moves the split", cmp === "20%", cmp);

  // ---- every picture arrives, and the clip is asked for
  await scrollThrough();
  const pics = await evaluate(`[...document.images].filter((i) => i.getBoundingClientRect().width > 0 && !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src)`);
  ok("every visible picture loads once scrolled to", pics.length === 0, pics.join(", "));
  const clip = await evaluate(`(() => { const v = document.querySelector(".clip video"); return v ? v.getAttribute("src") : "removed"; })()`);
  ok("the clip loads its large file at desktop width", clip === "example/media/site/ledger-post-large.mp4", clip);
  ok("no script error while using it", errors.length === 0, errors.join(" | "));

  for (const w of [390, 1440]) {
    await open(w);
    await scrollThrough();
    const s = await evaluate(`({ over: document.documentElement.scrollWidth - innerWidth,
      out: [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest(".tw, .cmd pre, .shot"); }).length })`);
    ok(`nothing pushes the page sideways at ${w}px`, s.over <= 0 && s.out === 0, `${s.over}px, ${s.out} element(s) past the edge`);
  }

  // ---- reduced motion: no clip, the end frame, nothing hidden
  await open(1440, { reduced: true });
  const rm = await evaluate(`({ video: getComputedStyle(document.querySelector(".clip video")).display, src: document.querySelector(".clip video").getAttribute("src"),
    end: getComputedStyle(document.querySelector(".clip .media-still--end")).display, start: getComputedStyle(document.querySelector(".clip .media-still--start")).display,
    hidden: document.querySelectorAll(".reveal--initial").length })`);
  ok("reduced motion: the clip is never fetched", rm.video === "none" && !rm.src, JSON.stringify(rm));
  ok("reduced motion: the end frame shows what the headline claims", rm.end === "block" && rm.start === "none", JSON.stringify(rm));
  ok("reduced motion: nothing is left waiting to reveal", rm.hidden === 0);
} finally {
  chrome.kill();
}

// ---- the marketing audit
const a = await runAudit(`${base}/index.html`, undefined, null);
ok("the audit reads it as a marketing page without being told", a.summary.mode !== "erp", a.summary.mode);
ok("the marketing audit finds nothing", a.findings.length === 0, a.findings.map((f) => f.title).join(" | "));
server.close();

// ---- the counts the page quotes are today's
if (!process.env.SKIP_SUITES) {
  for (const m of html.matchAll(/<li><b>([a-z]+)<\/b><span>[^<]*<\/span><em>(\d+)<\/em><\/li>/g)) {
    const [, suite, quoted] = m;
    let out = "";
    try { out = execFileSync("node", [path.join(ROOT, "test", `${suite}.mjs`)], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 }); }
    catch (e) { out = (e.stdout ?? "") + ""; }
    const last = [...out.matchAll(/(\d+)\/(\d+)/g)].pop();
    ok(`the page's ${suite} count (${quoted}) is what the suite passes today`, last && last[1] === quoted && last[2] === quoted, last ? `${last[1]}/${last[2]}` : "no count printed");
  }
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nsite  ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
