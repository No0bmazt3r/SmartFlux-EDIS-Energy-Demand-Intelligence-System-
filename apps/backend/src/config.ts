// Reads .env (if present) and picks the run mode. Sample mode is the default so a clean clone runs.
// SAMPLE_MODE=false turns on both live paths; DATA_MODE / LLM_MODE switch one side on its own
// (e.g. Nightshift on this laptop while Zetaris runs on a teammate's machine).
export type LlmMode = "nightshift" | "nvidia" | "replay" | "rules";
export type Mode = { data: "zetaris" | "local"; llm: LlmMode };
const LLM_MODES: LlmMode[] = ["nightshift", "nvidia", "replay", "rules"];

try { process.loadEnvFile(); } catch { /* no .env: defaults apply */ }

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const sample = env.SAMPLE_MODE !== "false";
  const mode: Mode = {
    data: (env.DATA_MODE ?? (sample ? "local" : "zetaris")) === "zetaris" ? "zetaris" : "local",
    llm: LLM_MODES.find((m) => m === (env.LLM_MODE ?? (sample ? "rules" : "nightshift"))) ?? "rules",
  };
  const need = [
    ...(mode.data === "zetaris" ? ["ZETARIS_ORG_ID", "ZETARIS_API_KEY", ...(env.ZETARIS_REST_URL || env.ZETARIS_BASE_URL ? [] : ["ZETARIS_REST_URL"])] : []),
    ...(mode.llm === "nightshift" ? ["METERLESS_BASE_URL", "METERLESS_RUNTIME_TOKEN", "MODEL_FAST", "MODEL_DEEP"] : []),
    ...(mode.llm === "nvidia" ? ["NVIDIA_API_KEY"] : []),
  ];
  const missing = need.filter((v) => !env[v]);
  if (missing.length) throw new Error(`Live mode needs ${missing.join(", ")}. Set them in .env, or run with SAMPLE_MODE=true.`);
  return {
    mode,
    dataDir: env.DATA_DIR ?? "data/sample",
    logDir: env.LOG_DIR ?? "logs",
    hmemDir: env.HMEM_DIR ?? "data/hmem",
    port: Number(env.PORT ?? 8000),
    caps: {
      toolCalls: Number(env.MAX_TOOL_CALLS ?? 30),
      rejectionsPerClaim: Number(env.MAX_REJECTIONS_PER_CLAIM ?? 3),
      replans: Number(env.MAX_REPLANS ?? 2),
    },
    zetaris: mode.data === "zetaris"
      ? { restUrl: env.ZETARIS_REST_URL, baseUrl: env.ZETARIS_BASE_URL, orgId: env.ZETARIS_ORG_ID!, apiKey: env.ZETARIS_API_KEY!, timeoutMs: Number(env.ZETARIS_TIMEOUT_MS ?? 30_000) }
      : undefined,
    llm: mode.llm === "nightshift"
      ? { provider: "Nightshift", baseUrl: env.METERLESS_BASE_URL!, token: env.METERLESS_RUNTIME_TOKEN!, models: { fast: env.MODEL_FAST!, deep: env.MODEL_DEEP! }, timeoutMs: Number(env.NIGHTSHIFT_TIMEOUT_MS ?? 60_000) }
      : mode.llm === "nvidia"
      ? {
          provider: "NVIDIA", baseUrl: env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1", token: env.NVIDIA_API_KEY!,
          models: { fast: env.NVIDIA_MODEL_FAST ?? "nvidia/nemotron-3.5-lightning-30b-a3b", deep: env.NVIDIA_MODEL_DEEP ?? "nvidia/nemotron-3.5-lightning-30b-a3b" },
          timeoutMs: Number(env.NVIDIA_TIMEOUT_MS ?? 60_000), jsonMode: env.NVIDIA_JSON_MODE === "true",
          extraBody: JSON.parse(env.NVIDIA_EXTRA_BODY || '{"chat_template_kwargs":{"enable_thinking":false}}'),
        }
      : undefined,
    llmCacheDir: env.LLM_CACHE_DIR ?? "data/sample/llm-cache",
    llmRecord: env.LLM_RECORD === "true",
  };
}

export type Config = ReturnType<typeof loadConfig>;
