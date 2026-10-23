// Reads .env (if present) and picks the run mode. Sample mode is the default so a clean clone runs.
export type Mode = { data: "zetaris" | "local"; llm: "nightshift" | "rules" };

const LIVE_VARS = ["ZETARIS_REST_URL", "ZETARIS_ORG_ID", "ZETARIS_API_KEY", "METERLESS_BASE_URL", "METERLESS_RUNTIME_TOKEN", "MODEL_FAST", "MODEL_DEEP"];

try { process.loadEnvFile(); } catch { /* no .env: defaults apply */ }

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const sample = env.SAMPLE_MODE !== "false";
  if (!sample) {
    const missing = LIVE_VARS.filter((v) => !env[v]);
    if (missing.length) throw new Error(`Live mode needs ${missing.join(", ")}. Set them in .env, or run with SAMPLE_MODE=true.`);
  }
  return {
    mode: (sample ? { data: "local", llm: "rules" } : { data: "zetaris", llm: "nightshift" }) as Mode,
    dataDir: env.DATA_DIR ?? "data/sample",
    logDir: env.LOG_DIR ?? "logs",
    hmemDir: env.HMEM_DIR ?? "data/hmem",
    port: Number(env.PORT ?? 8000),
    caps: {
      toolCalls: Number(env.MAX_TOOL_CALLS ?? 30),
      rejectionsPerClaim: Number(env.MAX_REJECTIONS_PER_CLAIM ?? 3),
      replans: Number(env.MAX_REPLANS ?? 2),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
