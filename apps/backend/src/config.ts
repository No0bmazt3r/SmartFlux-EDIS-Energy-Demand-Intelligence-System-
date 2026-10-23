// Reads .env (if present) and picks the run mode. Sample mode is the default so a clean clone runs.
// SAMPLE_MODE=false turns on both live paths; DATA_MODE / LLM_MODE switch one side on its own
// (e.g. Nightshift on this laptop while Zetaris runs on a teammate's machine).
export type Mode = { data: "zetaris" | "local"; llm: "nightshift" | "rules" };

try { process.loadEnvFile(); } catch { /* no .env: defaults apply */ }

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const sample = env.SAMPLE_MODE !== "false";
  const mode: Mode = {
    data: (env.DATA_MODE ?? (sample ? "local" : "zetaris")) === "zetaris" ? "zetaris" : "local",
    llm: (env.LLM_MODE ?? (sample ? "rules" : "nightshift")) === "nightshift" ? "nightshift" : "rules",
  };
  const need = [
    ...(mode.data === "zetaris" ? ["ZETARIS_ORG_ID", "ZETARIS_API_KEY", ...(env.ZETARIS_REST_URL || env.ZETARIS_BASE_URL ? [] : ["ZETARIS_REST_URL"])] : []),
    ...(mode.llm === "nightshift" ? ["METERLESS_BASE_URL", "METERLESS_RUNTIME_TOKEN", "MODEL_FAST", "MODEL_DEEP"] : []),
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
      ? { baseUrl: env.METERLESS_BASE_URL!, token: env.METERLESS_RUNTIME_TOKEN!, models: { fast: env.MODEL_FAST!, deep: env.MODEL_DEEP! }, timeoutMs: Number(env.NIGHTSHIFT_TIMEOUT_MS ?? 60_000) }
      : undefined,
  };
}

export type Config = ReturnType<typeof loadConfig>;
