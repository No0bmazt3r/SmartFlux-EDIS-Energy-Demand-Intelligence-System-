// Meterless Nightshift: the only AI provider. One injected generator (Meterless README §2): every model call
// in SmartFlux goes through it, pointed at the Nightshift Runtime by configuration. Nightshift speaks the
// OpenAI chat-completions format (technical execution guide §6), so plain fetch is enough; no SDK needed.
// Two pinned lanes route to NVIDIA Nemotron: fast for Scout and Planner, deep for Skeptic and Reporter.
// The model that actually answered is returned so every log event can show it.

export type Lane = "fast" | "deep";
export type LlmConfig = { baseUrl: string; token: string; models: Record<Lane, string>; app?: string; timeoutMs?: number; retries?: number };
export type GenerateOpts = { lane: Lane; system?: string; json?: boolean; maxTokens?: number; signal?: AbortSignal };
export type Generation = { text: string; model: string; ms: number; retries: number };
export type Generator = (prompt: string, opts: GenerateOpts) => Promise<Generation>;

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createNightshift(cfg: LlmConfig): Generator {
  const timeout = cfg.timeoutMs ?? 60_000, maxRetries = cfg.retries ?? 2;
  return async (prompt, opts) => {
    const t0 = performance.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json",
            "meterless-app": cfg.app ?? "smartflux", "meterless-scope": "user",
          },
          body: JSON.stringify({
            model: cfg.models[opts.lane],
            messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: prompt }],
            temperature: 0, max_tokens: opts.maxTokens ?? 800,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: opts.signal ?? AbortSignal.timeout(timeout),
        });
        if (!res.ok) throw new LlmError(`Nightshift HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
        const body = await res.json();
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new LlmError("Nightshift returned no message content");
        return { text, model: body.model ?? cfg.models[opts.lane], ms: Math.round(performance.now() - t0), retries: attempt };
      } catch (e) {
        const status = (e as LlmError).status;
        const retriable = status === undefined || status === 429 || status >= 500; // network, timeout, rate limit, server
        if (!retriable || attempt >= maxRetries) throw e;
        await sleep(500 * 2 ** attempt);
      }
    }
  };
}

// Models return JSON with stray prose or code fences more often than not; take the first JSON object.
export function parseJson<T = any>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("No JSON object in the model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}
