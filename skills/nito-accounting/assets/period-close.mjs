// Year-end closing, opening balances and foreign-currency revaluation. Each
// function returns draft entries or a posting request; the posting service
// posts them like any other (validateEntry, numbering, period lock).
// test/accounting.mjs ties the closing to E17-E19, the opening entry to E22
// and the revaluation to C5 (references/journals-and-gl.md, inventory-assets-cash.md).
import { toMinor, fromMinor } from "./posting-core.mjs";
import { balances } from "./reports.mjs";

const PL = new Set(["revenue", "contra_revenue", "expense", "temporary"]);
const line = (account, m) => ({ account, debit: fromMinor(m > 0n ? m : 0n), credit: fromMinor(m < 0n ? -m : 0n) });

// Closing through the income summary, as OpenStax 5.1 lays it out: close the
// credit-balance P&L accounts (E17), the debit-balance ones (E18), move the
// net to retained earnings (E19), then close dividends declared. Each draft
// carries source_type "year_end_close" so the statements can leave it out.
export function closingEntries(entries, accounts, { fiscalYearStart, fiscalYearEnd, incomeSummary, retainedEarnings, created_by }) {
  const bal = balances(entries, { from: fiscalYearStart, to: fiscalYearEnd });
  const credits = [], debits = [], dividends = [];
  for (const [code, m] of [...bal].sort(([a], [b]) => a.localeCompare(b))) {
    const a = accounts[code];
    if (!a || m === 0n || a.closing_only) continue;
    if (PL.has(a.type)) (m < 0n ? credits : debits).push([code, m]);
    else if (a.type === "contra_equity") dividends.push([code, m]);
  }
  const head = (n, description) => ({ status: "draft", posting_date: fiscalYearEnd, document_date: fiscalYearEnd,
    source_type: "year_end_close", source_id: `FY${fiscalYearEnd.slice(0, 4)}`, idempotency_key: `close:${fiscalYearEnd}:${n}`,
    created_by, description });
  const out = [];
  const sum = (xs) => xs.reduce((s, [, m]) => s + m, 0n);
  if (credits.length) out.push({ ...head(1, "Close revenue and other income"), lines: [...credits.map(([c, m]) => line(c, -m)), line(incomeSummary, sum(credits))] });
  if (debits.length) out.push({ ...head(2, "Close expenses"), lines: [line(incomeSummary, sum(debits)), ...debits.map(([c, m]) => line(c, -m))] });
  const net = -(sum(credits) + sum(debits));           // profit is positive
  if (net !== 0n) out.push({ ...head(3, net > 0n ? "Profit to retained earnings" : "Loss to retained earnings"),
    lines: [line(incomeSummary, net), line(retainedEarnings, -net)] });
  if (dividends.length) out.push({ ...head(4, "Close dividends declared"),
    lines: [line(retainedEarnings, sum(dividends)), ...dividends.map(([c, m]) => line(c, -m))] });
  return { entries: out, net_profit: (net < 0n ? "-" : "") + fromMinor(net < 0n ? -net : net) };
}

// Opening balances from a legacy system (E22): one entry, every balance on
// its normal side, posted on the first day of the first open period. Refused
// when it does not balance; a difference is a data problem to find, never a
// figure to park in suspense.
export function openingEntry(rows, { date, created_by }) {
  let dr = 0n, cr = 0n;
  const lines = rows.map(({ account, debit = "0.00", credit = "0.00", party }) => {
    dr += toMinor(debit); cr += toMinor(credit);
    return { account, debit, credit, ...(party ? { party } : {}) };
  });
  if (dr !== cr) throw new Error(`opening balances do not balance: debit ${fromMinor(dr)}, credit ${fromMinor(cr)}`);
  return { status: "draft", posting_date: date, document_date: date, source_type: "opening_balance", source_id: date,
    idempotency_key: `opening:${date}`, created_by, description: "Opening balances", lines };
}

// Revaluation of a foreign-currency monetary balance at a closing rate (IAS 21,
// C5). foreign: "10000.00", book: the functional-currency balance now carried,
// rate: functional per foreign unit, up to 8 decimals. Returns the posting
// request for fx_revaluation_gain or fx_revaluation_loss, or null when nothing
// moved. Unrealised and realised differences belong in separate accounts.
export function fxRevaluation({ account, foreign, book, rate, posting_date, idempotency_key, created_by }) {
  const RS = 8n;
  const [ri, rf = ""] = rate.split(".");
  if (rf.length > Number(RS)) throw new RangeError("rate has more than 8 decimals");
  const r = BigInt(ri) * 10n ** RS + BigInt((rf + "00000000").slice(0, 8));
  const restated = (toMinor(foreign) * r * 2n + 10n ** RS) / (10n ** RS * 2n);   // half up
  const diff = restated - toMinor(book);
  if (diff === 0n) return null;
  const amount = fromMinor(diff > 0n ? diff : -diff);
  return { event_type: diff > 0n ? "fx_revaluation_gain" : "fx_revaluation_loss", restated: fromMinor(restated),
    posting_date, document_date: posting_date, source_type: "fx_revaluation", source_id: `${account}:${posting_date}`,
    idempotency_key, created_by, amounts: { revalued_account: amount, fx_unrealised_gain_loss: amount }, account };
}
