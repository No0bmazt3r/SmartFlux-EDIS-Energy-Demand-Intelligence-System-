// Meterless H-MEM, the minimum the spec recommends for a six-day build: MemoryStoreService (tiered, file-backed,
// warm start) + MemoryRetrievalService (hybrid ranking, structured payload with trace metadata), plus the trust
// ledger as JSONL. Capture is the spec's no-model path: agents write concise structured facts directly.
// SmartFlux rule on top: a memory is only visible to runs whose as_of is on or after the as_of it was learned at.
// ponytail: dreaming, sleep and conflict resolution skipped; supersedes covers the one conflict we have (a new baseline).
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Layer = "short_term" | "working" | "long_term";
export type MemoryRecord = {
  id: string; content: string; type: "factual" | "procedural" | "preference" | "general" | "personal";
  layer: Layer; timestamp: string; as_of: string; lastAccessed?: string; accessCount: number;
  tags: string[]; confidence: number; source: string; domain: string; namespace: string;
  entities: string[]; relatedTo: string[]; supersedes?: string; supersededBy?: string; derivedFrom: string[];
  agentId: string; runId: string; taskId?: string;
  data: Record<string, any>; // structured payload (e.g. a baseline value and its standard error)
};
export type NewMemory = Pick<MemoryRecord, "content" | "type" | "layer" | "as_of" | "tags" | "entities" | "agentId" | "runId" | "data"> &
  Partial<Pick<MemoryRecord, "confidence" | "source" | "domain" | "namespace" | "derivedFrom" | "taskId" | "relatedTo">> & { supersedes?: string };
export type RecallQuery = { asOf: string; text?: string; tags?: string[]; entities?: string[]; topN?: number; threshold?: number; includeSuperseded?: boolean };
export type Feedback = "helpful" | "not_helpful" | "wrong";

const LAYER_WEIGHT: Record<Layer, number> = { long_term: 1, working: 0.8, short_term: 0.6 };
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9.%-]+/).filter((t) => t.length > 2));
const overlap = (a: Set<string> | string[], b: Set<string> | string[]) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
};

export function openHmem(dir: string, ledgerDir: string) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = join(ledgerDir, "hmem-ledger.jsonl");
  const tierPath = (l: Layer) => join(dir, `${l}.json`);
  const load = (l: Layer): MemoryRecord[] => (l !== "short_term" && existsSync(tierPath(l)) ? JSON.parse(readFileSync(tierPath(l), "utf8")) : []);
  // Warm start: hydrate long-term and working; short-term lives only in this process.
  const byId = new Map<string, MemoryRecord>();
  for (const l of ["long_term", "working"] as Layer[]) for (const m of load(l)) byId.set(m.id, m);

  const persist = () => {
    for (const l of ["long_term", "working"] as Layer[]) {
      const tmp = tierPath(l) + ".tmp";
      writeFileSync(tmp, JSON.stringify([...byId.values()].filter((m) => m.layer === l), null, 1));
      renameSync(tmp, tierPath(l)); // atomic: a crash never leaves half a memory file
    }
  };
  const audit = (memoryId: string, action: string, actor: string, details: Record<string, unknown> = {}) =>
    appendFileSync(ledgerPath, JSON.stringify({ ts: new Date().toISOString(), memoryId, action, actor, ...details }) + "\n");

  function write(m: NewMemory): MemoryRecord {
    const rec: MemoryRecord = {
      id: `m-${randomUUID().slice(0, 8)}`, timestamp: new Date().toISOString(), accessCount: 0,
      confidence: 0.8, source: "agent", domain: "energy", namespace: m.tags[0] ?? "general", derivedFrom: [], relatedTo: [], ...m,
    };
    if (m.supersedes) {
      const old = byId.get(m.supersedes);
      if (old) { old.supersededBy = rec.id; audit(old.id, "update", m.agentId, { supersededBy: rec.id }); }
    }
    // relatedTo by shared entities (capped at 5, as the spec suggests)
    rec.relatedTo = [...byId.values()].filter((o) => o.id !== rec.id && overlap(o.entities, rec.entities) > 0).slice(-5).map((o) => o.id);
    byId.set(rec.id, rec);
    if (rec.layer !== "short_term") persist();
    audit(rec.id, "create", rec.agentId, { runId: rec.runId, tags: rec.tags, as_of: rec.as_of, content: rec.content });
    return rec;
  }

  // Hybrid ranking: keyword + tag + entity overlap, layer weight, recency (by as_of), superseded penalty, confidence.
  function recall(q: RecallQuery, actor: string) {
    const qTokens = tokens(q.text ?? "");
    // Superseded only once the replacement is itself visible at this as_of.
    const superseded = (m: MemoryRecord) => !!m.supersededBy && byId.get(m.supersededBy)!.as_of <= q.asOf;
    const visible = [...byId.values()].filter((m) =>
      m.as_of <= q.asOf && (q.includeSuperseded || !superseded(m)) &&
      (!q.tags || q.tags.every((t) => m.tags.includes(t))) && (!q.entities || q.entities.every((e) => m.entities.includes(e))));
    const scored = visible.map((m) => {
      const ageDays = (Date.parse(q.asOf) - Date.parse(m.as_of)) / 86400000;
      const relevance = 0.4 * overlap(qTokens, tokens(m.content)) + 0.3 * overlap(q.tags ?? [], m.tags) + 0.3 * overlap(q.entities ?? [], m.entities);
      const filtered = q.tags || q.entities ? 0.5 : 0; // an exact filter match is itself relevance
      const score = (filtered + relevance) * LAYER_WEIGHT[m.layer] * (0.7 + 0.3 * Math.exp(-ageDays / 30)) * m.confidence * (superseded(m) ? 0.3 : 1);
      return { memory: m, score, reason: [filtered ? "filter match" : "", relevance ? `relevance ${relevance.toFixed(2)}` : "", `learned as of ${m.as_of}`].filter(Boolean).join(", ") };
    }).filter((s) => s.score >= (q.threshold ?? 0.2)).sort((a, b) => b.score - a.score).slice(0, q.topN ?? 5);
    const now = new Date().toISOString();
    for (const s of scored) { s.memory.accessCount++; s.memory.lastAccessed = now; }
    if (scored.length) persist();
    audit("-", "read", actor, { query: q, hits: scored.map((s) => s.memory.id) });
    return {
      memories: scored, strategy: (q.topN ?? 5) <= 5 ? "task_focused" : "comprehensive",
      retrievalReason: `as_of ≤ ${q.asOf}${q.tags ? `, tags [${q.tags.join(",")}]` : ""}${q.entities ? `, entities [${q.entities.join(",")}]` : ""}${q.text ? `, text "${q.text}"` : ""}`,
    };
  }

  // Event-driven feedback (spec §11.2): verifier verdicts adjust confidence.
  function feedback(id: string, f: Feedback, actor: string) {
    const m = byId.get(id);
    if (!m) return;
    if (f === "helpful") { m.confidence = Math.min(1, m.confidence + 0.05); m.accessCount++; }
    if (f === "not_helpful") m.confidence = Math.max(0, m.confidence - 0.05);
    if (f === "wrong") { m.confidence = Math.max(0, m.confidence - 0.3); if (!m.tags.includes("review")) m.tags.push("review"); }
    persist();
    audit(id, "feedback", actor, { feedback: f, confidence: m.confidence });
  }

  const all = () => [...byId.values()];
  return { write, recall, feedback, all, ledgerPath };
}

export type Hmem = ReturnType<typeof openHmem>;
