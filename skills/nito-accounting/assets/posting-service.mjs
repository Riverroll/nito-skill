// The accounting service an ERP calls: the single write path into the ledger.
// It wraps posting-core in the transaction of references/starter-implementation.md
// and adds the outbox worker of references/integration-playbook.md.
//
// Storage sits behind a small repository, so the same service runs on the
// in-memory repository below (tests, prototypes) and on MariaDB/MySQL
// (createMysqlRepository). test/accounting.mjs drives the service through the
// in-memory repository. The MySQL repository is written from the documented
// SQL and has NOT been run against a database; run references/sql-checks.md on
// the project's server before trusting it.
import { buildEntry, validateEntry, reverseEntry, toMinor, fromMinor } from "./posting-core.mjs";

export function createPostingService({ repo }) {
  // request: { event_type, amounts, idempotency_key, source_type, source_id,
  //            posting_date, document_date, due_date?, created_by, party?,
  //            dimensions?, description? }
  // opts:    { company_id, journal_code, roles? }  roles overrides the company
  //          defaults for this one request (the chosen bank, an expense line)
  async function post(request, { company_id, journal_code, roles = {} }) {
    try {
      return await repo.transaction(async (tx) => {
        // 1. idempotency: a replay returns the first result
        const prev = await tx.findEntryByKey(company_id, request.idempotency_key);
        if (prev) return { ok: true, replay: true, entry_id: prev.entry_id, entry_number: prev.entry_number };
        // 2. account determination, then the rules
        const defaults = { ...(await tx.loadDefaults(company_id)), ...roles };
        const b = buildEntry(request, defaults);
        if (!b.ok) return b;
        const entry = b.entry;
        const accounts = await tx.loadAccounts(company_id, entry.lines.map((l) => l.account));
        for (const l of entry.lines) {
          const a = accounts[l.account];
          if (a?.control === "customer" || a?.control === "supplier") l.party ??= request.party;
          Object.assign(l, request.dimensions ?? {});
        }
        const open = await tx.isPeriodOpen(company_id, entry.posting_date);
        const v = validateEntry(entry, { accounts, isPeriodOpen: () => open });
        if (!v.ok) return v;
        // 3. the number, last, under the counter row's lock
        const year = Number(entry.posting_date.slice(0, 4));
        const n = await tx.nextNumber(company_id, journal_code, year);
        const entry_number = `${journal_code}/${year}/${String(n).padStart(4, "0")}`;
        // 4. insert as posted
        const entry_id = await tx.insertEntry({ ...entry, company_id, journal_code, entry_number, status: "posted" }, accounts);
        // 5. the stored rows must balance too
        const diff = await tx.entryDifference(entry_id);
        if (diff !== "0.00") throw new Error(`stored entry does not balance: ${diff}`);
        return { ok: true, entry_id, entry_number, total: v.total };
      });
    } catch (e) {
      // two requests with one key can both pass step 1; the unique index stops
      // the second, and it returns the first
      if (repo.isDuplicateKey?.(e)) {
        const prev = await repo.transaction((tx) => tx.findEntryByKey(company_id, request.idempotency_key));
        if (prev) return { ok: true, replay: true, entry_id: prev.entry_id, entry_number: prev.entry_number };
      }
      return { ok: false, errors: [e.message] };
    }
  }

  // A correction is a new entry; the original is marked reversed and kept.
  async function reverse({ company_id, entry_id, posting_date, created_by, reason }) {
    try {
      return await repo.transaction(async (tx) => {
        const orig = await tx.findEntry(company_id, entry_id);
        if (!orig) return { ok: false, errors: ["entry not found"] };
        if (orig.status !== "posted") return { ok: false, errors: [`entry is ${orig.status}; only a posted entry can be reversed`] };
        const key = `${orig.idempotency_key}:rev`;
        const prev = await tx.findEntryByKey(company_id, key);
        if (prev) return { ok: true, replay: true, entry_id: prev.entry_id, entry_number: prev.entry_number };
        const rev = reverseEntry(orig, { posting_date, idempotency_key: key, created_by });
        rev.description = reason ?? `Reversal of ${orig.entry_number}`;
        const accounts = await tx.loadAccounts(company_id, rev.lines.map((l) => l.account));
        const open = await tx.isPeriodOpen(company_id, posting_date);
        const v = validateEntry(rev, { accounts, isPeriodOpen: () => open });
        if (!v.ok) return v;
        const year = Number(posting_date.slice(0, 4));
        const n = await tx.nextNumber(company_id, orig.journal_code, year);
        const entry_number = `${orig.journal_code}/${year}/${String(n).padStart(4, "0")}`;
        const id = await tx.insertEntry({ ...rev, company_id, journal_code: orig.journal_code, entry_number, status: "posted",
          reverses_entry_id: entry_id }, accounts);
        await tx.markReversed(entry_id);
        return { ok: true, entry_id: id, entry_number };
      });
    } catch (e) { return { ok: false, errors: [e.message] }; }
  }

  // The outbox worker: posts what modules queued, records failures where a
  // person can see them, never deletes. Run it on a schedule or after commit.
  async function drainOutbox({ company_id, journalFor, limit = 50 }) {
    const done = [];
    for (const r of await repo.pendingRequests(company_id, limit)) {
      const payload = JSON.parse(r.payload);
      const res = await post(payload, { company_id, journal_code: journalFor(payload), roles: payload.roles ?? {} });
      await repo.settleRequest(r.request_id, res.ok
        ? { status: "posted", entry_id: res.entry_id }
        : { status: "failed", error: res.errors.join("; ") });
      done.push({ request_id: r.request_id, ...res });
    }
    return done;
  }

  return { post, reverse, drainOutbox };
}

// What a module calls inside ITS OWN transaction, next to its own insert: the
// request is stored, not posted. If the module's transaction rolls back, the
// request goes with it; if it commits, the worker will post it.
export function outboxRow(company_id, request) {
  if (!request.idempotency_key) throw new Error("idempotency_key is required");
  return { company_id, idempotency_key: request.idempotency_key, event_type: request.event_type,
    source_type: request.source_type, source_id: String(request.source_id), payload: JSON.stringify(request), status: "pending" };
}

// ---------------------------------------------------------------------------
// In-memory repository: the reference behaviour, used by the tests. One global
// lock stands in for row locks; a failed transaction restores a snapshot, so a
// refused posting consumes no number.
export function createMemoryRepository({ accounts, defaults, periods }) {
  const db = { accounts: structuredClone(accounts), defaults: { ...defaults }, periods: { ...periods },
    seq: {}, entries: [], requests: [], nextId: 1 };
  let chain = Promise.resolve();
  const view = (e) => e && { ...e, lines: e.lines.map((l) => ({ ...l })) };
  const tx = {
    async findEntryByKey(c, key) { return view(db.entries.find((e) => e.company_id === c && e.idempotency_key === key)); },
    async findEntry(c, id) { return view(db.entries.find((e) => e.company_id === c && e.entry_id === id)); },
    async loadDefaults() { return { ...db.defaults }; },
    async loadAccounts(c, codes) {
      return Object.fromEntries(codes.filter((k) => db.accounts[k]).map((k) => [k, { ...db.accounts[k] }]));
    },
    async isPeriodOpen(c, date) { return db.periods[date.slice(0, 7)] === "open"; },
    async nextNumber(c, j, y) { const k = `${c}|${j}|${y}`; const n = db.seq[k] ?? 1; db.seq[k] = n + 1; return n; },
    async insertEntry(e) {
      if (db.entries.some((x) => x.company_id === e.company_id && x.idempotency_key === e.idempotency_key))
        throw Object.assign(new Error("Duplicate entry for key uq_acc_entry_idem"), { code: "ER_DUP_ENTRY" });
      const entry_id = db.nextId++;
      db.entries.push({ ...e, entry_id, lines: e.lines.map((l, i) => ({ ...l, line_no: i + 1 })) });
      return entry_id;
    },
    async entryDifference(id) {
      const e = db.entries.find((x) => x.entry_id === id);
      return fromMinor(e.lines.reduce((s, l) => s + toMinor(l.debit) - toMinor(l.credit), 0n));
    },
    async markReversed(id) { db.entries.find((x) => x.entry_id === id).status = "reversed"; },
  };
  return {
    db,
    transaction(fn) {
      const run = chain.then(async () => {
        const snap = structuredClone({ seq: db.seq, entries: db.entries, nextId: db.nextId });
        try {
          const r = await fn(tx);
          if (r && r.ok === false) Object.assign(db, snap);     // a refusal leaves no trace
          return r;
        } catch (e) { Object.assign(db, snap); throw e; }
      });
      chain = run.catch(() => {});
      return run;
    },
    isDuplicateKey: (e) => e?.code === "ER_DUP_ENTRY",
    async enqueue(row) {
      if (db.requests.some((r) => r.company_id === row.company_id && r.idempotency_key === row.idempotency_key)) return false;
      db.requests.push({ ...row, request_id: db.requests.length + 1, attempts: 0 }); return true;
    },
    async pendingRequests(c, limit) {
      return db.requests.filter((r) => r.company_id === c && (r.status === "pending" || r.status === "failed")).slice(0, limit);
    },
    async settleRequest(id, { status, entry_id, error }) {
      const r = db.requests.find((x) => x.request_id === id);
      Object.assign(r, { status, entry_id: entry_id ?? null, last_error: error ?? null, attempts: r.attempts + 1 });
    },
  };
}

// ---------------------------------------------------------------------------
// MariaDB/MySQL repository for mysql2/promise. UNTESTED AGAINST A DATABASE.
// Table and column names are those of assets/ledger-schema.prisma. Money goes
// in and out as strings: create the pool with { decimalNumbers: false }.
export function createMysqlRepository(pool) {
  const txFor = (cn) => ({
    async findEntryByKey(c, key) {
      const [r] = await cn.query("SELECT entry_id, entry_number, status FROM T_L_ACC_JOURNAL_ENTRY WHERE company_id = ? AND idempotency_key = ?", [c, key]);
      return r[0] ?? null;
    },
    async findEntry(c, id) {
      const [h] = await cn.query("SELECT * FROM T_L_ACC_JOURNAL_ENTRY WHERE company_id = ? AND entry_id = ?", [c, id]);
      if (!h[0]) return null;
      const [l] = await cn.query(
        `SELECT a.account_code AS account, l.debit, l.credit, l.party_type, l.party_id AS party, l.cost_center_id, l.site_id, l.project_id, l.analytic_ref
           FROM T_L_ACC_JOURNAL_LINE l JOIN T_M_ACC_ACCOUNT a ON a.account_id = l.account_id
          WHERE l.entry_id = ? ORDER BY l.line_no`, [id]);
      const e = h[0];
      return { ...e, posting_date: iso(e.posting_date), document_date: iso(e.document_date), lines: l };
    },
    async loadDefaults(c) {
      const [r] = await cn.query(
        `SELECT d.role_key, a.account_code FROM T_M_ACC_DEFAULT_ACCOUNT d JOIN T_M_ACC_ACCOUNT a ON a.account_id = d.account_id WHERE d.company_id = ?`, [c]);
      return Object.fromEntries(r.map((x) => [x.role_key, x.account_code]));
    },
    async loadAccounts(c, codes) {
      if (!codes.length) return {};
      const [r] = await cn.query(
        `SELECT account_id, account_code, is_active, is_postable, control_type FROM T_M_ACC_ACCOUNT WHERE company_id = ? AND account_code IN (?)`, [c, [...new Set(codes)]]);
      return Object.fromEntries(r.map((a) => [a.account_code, { account_id: a.account_id, active: !!a.is_active, postable: !!a.is_postable, control: a.control_type }]));
    },
    async isPeriodOpen(c, date) {
      const [r] = await cn.query("SELECT status FROM T_M_ACC_PERIOD WHERE company_id = ? AND ? BETWEEN start_date AND end_date", [c, date]);
      return r[0]?.status === "open";
    },
    async nextNumber(c, j, y) {
      const [r] = await cn.query("SELECT next_number FROM T_M_ACC_SEQUENCE WHERE company_id = ? AND journal_code = ? AND fiscal_year = ? FOR UPDATE", [c, j, y]);
      if (!r[0]) throw new Error(`no numbering row for ${j} ${y}: create it when the fiscal year is opened`);
      await cn.query("UPDATE T_M_ACC_SEQUENCE SET next_number = next_number + 1 WHERE company_id = ? AND journal_code = ? AND fiscal_year = ?", [c, j, y]);
      return r[0].next_number;
    },
    async insertEntry(e, accounts) {
      const [h] = await cn.query(
        `INSERT INTO T_L_ACC_JOURNAL_ENTRY (company_id, journal_code, entry_number, status, posting_date, document_date, due_date,
           description, source_type, source_id, idempotency_key, reverses_entry_id, created_by, approved_by, posted_at)
         VALUES (?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [e.company_id, e.journal_code, e.entry_number, e.posting_date, e.document_date ?? e.posting_date, e.due_date ?? null,
         e.description ?? null, e.source_type ?? null, e.source_id ?? null, e.idempotency_key, e.reverses_entry_id ?? null,
         e.created_by, e.approved_by ?? null]);
      const rows = e.lines.map((l, i) => [h.insertId, i + 1, accounts[l.account].account_id, l.debit, l.credit,
        l.currency_code ?? "IDR", l.amount_currency ?? (toMinor(l.debit) ? l.debit : l.credit), l.exchange_rate ?? "1",
        l.party_type ?? null, l.party ?? null, l.cost_center_id ?? null, l.site_id ?? null, l.project_id ?? null, l.analytic_ref ?? null, l.description ?? null]);
      await cn.query(
        `INSERT INTO T_L_ACC_JOURNAL_LINE (entry_id, line_no, account_id, debit, credit, currency_code, amount_currency, exchange_rate,
           party_type, party_id, cost_center_id, site_id, project_id, analytic_ref, description) VALUES ?`, [rows]);
      return h.insertId;
    },
    async entryDifference(id) {
      const [r] = await cn.query("SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS d FROM T_L_ACC_JOURNAL_LINE WHERE entry_id = ?", [id]);
      return String(r[0].d) === "0" ? "0.00" : String(r[0].d);
    },
    async markReversed(id) { await cn.query("UPDATE T_L_ACC_JOURNAL_ENTRY SET status = 'reversed' WHERE entry_id = ? AND status = 'posted'", [id]); },
  });
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  return {
    async transaction(fn) {
      const cn = await pool.getConnection();
      try {
        await cn.beginTransaction();
        const r = await fn(txFor(cn));
        if (r && r.ok === false) await cn.rollback(); else await cn.commit();
        return r;
      } catch (e) { await cn.rollback(); throw e; }
      finally { cn.release(); }
    },
    isDuplicateKey: (e) => e?.code === "ER_DUP_ENTRY",
    async pendingRequests(c, limit) {
      const [r] = await pool.query(
        "SELECT request_id, payload FROM T_L_ACC_POSTING_REQUEST WHERE company_id = ? AND status IN ('pending','failed') AND attempts < 10 ORDER BY request_id LIMIT ?", [c, limit]);
      return r;
    },
    async settleRequest(id, { status, entry_id, error }) {
      await pool.query(
        "UPDATE T_L_ACC_POSTING_REQUEST SET status = ?, entry_id = ?, last_error = ?, attempts = attempts + 1, posted_at = IF(? = 'posted', NOW(), NULL) WHERE request_id = ?",
        [status, entry_id ?? null, error ?? null, status, id]);
    },
  };
}
