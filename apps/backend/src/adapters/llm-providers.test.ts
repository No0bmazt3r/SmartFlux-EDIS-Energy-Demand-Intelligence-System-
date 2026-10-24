import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../config.ts";
import { parseJson, type Generator } from "./llm.ts";
import { cacheKey, createReplay, withRecording } from "./llm-providers.ts";

const fake: Generator = async (prompt, o) => ({ text: `{"echo": ${JSON.stringify(prompt)}, "lane": "${o.lane}"}`, model: `fake-${o.lane}`, ms: 5, retries: 0 });

test("a recorded answer replays offline, marked as replayed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "llm-cache-"));
  const live = await withRecording(fake, dir, "nvidia")("hello", { lane: "fast", json: true });
  assert.equal(readdirSync(dir).length, 1);
  const again = await createReplay(dir)("hello", { lane: "fast", json: true });
  assert.equal(again.text, live.text);
  assert.equal(again.model, "fake-fast (replayed)");
});

test("a different prompt or lane is a replay miss, which throws so the rules twin takes over", async () => {
  const dir = mkdtempSync(join(tmpdir(), "llm-cache-"));
  await withRecording(fake, dir, "nvidia")("hello", { lane: "fast" });
  await assert.rejects(createReplay(dir)("hello!", { lane: "fast" }), /replay miss/);
  await assert.rejects(createReplay(dir)("hello", { lane: "deep" }), /replay miss/);
  assert.notEqual(cacheKey("a", { lane: "fast" }), cacheKey("a", { lane: "fast", json: true }));
});

test("LLM_MODE=nvidia needs NVIDIA_API_KEY and defaults to the Nemotron models", () => {
  assert.throws(() => loadConfig({ SAMPLE_MODE: "true", LLM_MODE: "nvidia" }), /NVIDIA_API_KEY/);
  const cfg = loadConfig({ SAMPLE_MODE: "true", LLM_MODE: "nvidia", NVIDIA_API_KEY: "k" });
  assert.equal(cfg.mode.llm, "nvidia");
  assert.match(cfg.llm!.models.deep, /nemotron/);
  assert.equal(loadConfig({ SAMPLE_MODE: "true", LLM_MODE: "replay" }).mode.llm, "replay");
  assert.equal(loadConfig({ SAMPLE_MODE: "true" }).mode.llm, "rules");
});

test("parseJson ignores a <think> block before the answer", () => {
  assert.deepEqual(parseJson('<think>maybe {x}</think>{"ok": true}'), { ok: true });
});

test("run ids in a prompt don't change the key, so memory that mentions an earlier run still replays", () => {
  assert.equal(cacheKey("Outcome of r-2d92814d-a1: verified", { lane: "fast" }), cacheKey("Outcome of r-c63f07f1-a1: verified", { lane: "fast" }));
  assert.notEqual(cacheKey("Outcome: verified", { lane: "fast" }), cacheKey("Outcome: not achieved", { lane: "fast" }));
});
