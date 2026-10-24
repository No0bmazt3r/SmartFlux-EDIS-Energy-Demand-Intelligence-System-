// Meterless Nightshift: the only AI provider. One injected generator (Meterless README §2): every model call
// in SmartFlux goes through it, pointed at the Nightshift Runtime by configuration. Nightshift speaks the
// OpenAI chat-completions format (technical execution guide §6), so plain fetch is enough; no SDK needed.
// Two pinned lanes route to NVIDIA Nemotron: fast for Scout and Planner, deep for Skeptic and Reporter.
// The model that actually answered is returned so every log event can show it.

export type Lane = "fast" | "deep";
// jsonMode: send response_format (Nightshift: yes; some NVIDIA endpoints reject it, so it is optional there).
// extraBody: provider-specific fields merged into the request, e.g. turning off Nemotron's thinking output.
export type LlmConfig = {
  baseUrl: string; token: string; models: Record<Lane, string>; app?: string; timeoutMs?: number; retries?: number;
  provider?: string; jsonMode?: boolean; extraBody?: Record<string, unknown>;
};
export type GenerateOpts = { lane: Lane; system?: string; json?: boolean; maxTokens?: number; signal?: AbortSignal };
export type Generation = { text: string; model: string; ms: number; retries: number };
export type Generator = (prompt: string, opts: GenerateOpts) => Promise<Generation>;

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Message = { role: "system" | "user" | "assistant"; content: string };
const REPAIR = "That was not a valid JSON object. Reply with only the JSON object, nothing else.";

export function createNightshift(cfg: LlmConfig): Generator {
  const timeout = cfg.timeoutMs ?? 60_000, maxRetries = cfg.retries ?? 2;
  const call = async (messages: Message[], opts: GenerateOpts) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json",
            "meterless-app": cfg.app ?? "smartflux", "meterless-scope": "user",
          },
          body: JSON.stringify({
            model: cfg.models[opts.lane], messages, temperature: 0, max_tokens: opts.maxTokens ?? 800,
            ...(opts.json && cfg.jsonMode !== false ? { response_format: { type: "json_object" } } : {}),
            ...(cfg.extraBody ?? {}),
          }),
          signal: opts.signal ?? AbortSignal.timeout(timeout),
        });
        if (!res.ok) throw new LlmError(`${cfg.provider ?? "Nightshift"} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
        const body = await res.json();
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new LlmError(`${cfg.provider ?? "Nightshift"} returned no message content`);
        return { text, model: (body.model ?? cfg.models[opts.lane]) as string, retries: attempt };
      } catch (e) {
        const status = (e as LlmError).status;
        const retriable = status === undefined || status === 429 || status >= 500; // network, timeout, rate limit, server
        if (!retriable || attempt >= maxRetries) throw e;
        await sleep(500 * 2 ** attempt);
      }
    }
  };
  return async (prompt, opts) => {
    const t0 = performance.now();
    const messages: Message[] = [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []), { role: "user", content: prompt }];
    let g = await call(messages, opts);
    // One repair prompt on bad JSON; if that fails too, the caller's parse throws and the rules twin answers.
    if (opts.json) try { parseJson(g.text); } catch {
      const fixed = await call([...messages, { role: "assistant", content: g.text }, { role: "user", content: REPAIR }], opts);
      g = { ...fixed, retries: g.retries + fixed.retries + 1 };
    }
    return { ...g, ms: Math.round(performance.now() - t0) };
  };
}

// Models return JSON with stray prose or code fences more often than not; take the first JSON object.
export function parseJson<T = any>(text: string): T {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, ""); // reasoning models may prepend <think>…</think>
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("No JSON object in the model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}
