// Zetaris: the live data layer. Request shape follows Zetaris's own client (getting-started repo @44668b2,
// scripts/zetaris_sql.py RestChannel and scripts/query_zetaris.ts): POST {ZETARIS_REST_URL}/sql-editor/sqls/run
// with a bearer key, X-Org-ID and a fresh UUID X-Request-ID. The UI proxy route is the fallback channel.
// Rules from Zetaris AGENTS.md: Lightning SQL only, one statement per call, no trailing semicolon,
// read-only from the agent, credentials never logged or put in a URL.
import { randomUUID } from "node:crypto";

export type ZetarisConfig = { restUrl?: string; baseUrl?: string; orgId: string; apiKey: string; timeoutMs?: number };
export class ZetarisError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const READ_ONLY = /^\s*(SELECT|SHOW|DESCRIBE|WITH)\b/i;
const SAFE_VALUE = /^[\w .:+-]*$/; // outlet/machine ids, dates and timestamps: nothing that can break out of a literal

// Lightning SQL over REST has no bound parameters, so :name placeholders become literals, but only for
// values that pass a strict whitelist. Strings are quoted with '' escaping on top of that.
export function bindParams(sql: string, params: Record<string, string | number>) {
  return sql.replace(/:([a-z_]+)\b/g, (match, name) => {
    if (!(name in params)) return match;
    const v = params[name];
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new ZetarisError(`Parameter ${name} is not a finite number`);
      return String(v);
    }
    if (!SAFE_VALUE.test(v)) throw new ZetarisError(`Parameter ${name} has characters that are not allowed`);
    return `'${v.replace(/'/g, "''")}'`;
  });
}

// Column names from a SELECT list (our templates only), used when the response has rows as arrays without names.
export function selectColumns(sql: string) {
  const list = sql.replace(/\s+/g, " ").match(/^\s*SELECT\s+(?:DISTINCT\s+)?(.*?)\s+FROM\s/i)?.[1] ?? "";
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim().match(/\bAS\s+`?(\w+)`?$/i)?.[1] ?? p.trim().split(".").pop()!.replace(/`/g, ""));
}

const NUMERIC = /^-?\d+(\.\d+)?(e-?\d+)?$/i;
function normalize(out: any, sql: string): Record<string, unknown>[] {
  const data = Array.isArray(out) ? out : out?.data ?? out?.rows ?? out?.result?.data ?? [];
  if (!Array.isArray(data)) throw new ZetarisError("Unexpected Zetaris response shape (no data array)");
  const names: string[] | undefined =
    (out?.columns ?? out?.schema ?? out?.header ?? out?.result?.columns)?.map((c: any) => (typeof c === "string" ? c : c?.name ?? c?.columnName));
  return data.map((row: any) => {
    const obj = Array.isArray(row) ? Object.fromEntries((names ?? selectColumns(sql)).map((n, i) => [n, row[i]])) : { ...row };
    for (const k of Object.keys(obj)) if (typeof obj[k] === "string" && NUMERIC.test(obj[k])) obj[k] = Number(obj[k]);
    return obj;
  });
}

export function createZetaris(cfg: ZetarisConfig) {
  const timeout = cfg.timeoutMs ?? 30_000;
  async function post(url: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "X-Org-ID": cfg.orgId, "X-Request-ID": randomUUID(), "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      throw new ZetarisError(`Cannot reach Zetaris: ${(e as Error).name === "TimeoutError" ? `timed out after ${timeout / 1000}s` : (e as Error).message}`);
    }
    if (!res.ok) throw new ZetarisError(`Zetaris HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    return res.json();
  }

  // Sends one statement. Admin statements (CREATE ...) are only for the setup script, never the agent.
  async function exec(sql: string, opts: { limit?: number; admin?: boolean } = {}) {
    const statement = sql.trim().replace(/;\s*$/, "");
    if (!opts.admin && !READ_ONLY.test(statement)) throw new ZetarisError("Only SELECT, SHOW and DESCRIBE are allowed from the agent");
    if (!opts.admin && /;/.test(statement)) throw new ZetarisError("One statement per call");
    const limit = opts.limit ?? 5000;
    if (cfg.restUrl)
      try {
        return normalize(await post(`${cfg.restUrl.replace(/\/$/, "")}/sql-editor/sqls/run`, { queryId: randomUUID(), sql: statement, source: "SqlEditor", limit }), statement);
      } catch (e) {
        if (!cfg.baseUrl || (e as ZetarisError).status === 401) throw e; // a bad key won't work on the proxy either
      }
    if (!cfg.baseUrl) throw new ZetarisError("Set ZETARIS_REST_URL or ZETARIS_BASE_URL");
    return normalize(await post(`${cfg.baseUrl.replace(/\/$/, "")}/api/proxy/sql-editor/sqls/run-query`, { sql: statement, limit }), statement);
  }

  return { exec, query: (sql: string, params: Record<string, string | number>, limit?: number) => exec(bindParams(sql, params), { limit }) };
}

export type Zetaris = ReturnType<typeof createZetaris>;
