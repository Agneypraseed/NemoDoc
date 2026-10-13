import test from "node:test";
import assert from "node:assert/strict";
import { requireNemotron } from "../src/lib/model-policy.ts";
import { modelModality } from "../src/lib/model-modality.ts";
import {
  SettingsStore,
  settingsSchema,
  providerJSON,
} from "../server/settings.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const config = {
  apiKey: "test-key",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/Nemotron-3_5-Lightning",
};
test("settings label provider text and vision Nemotron models by input modality", () => {
  assert.equal(modelModality("nvidia/Nemotron-3_5-Lightning"), "Text");
  assert.equal(modelModality("nvidia/Nemotron-3-Nano-Omni"), "Text");
  assert.equal(modelModality("nvidia/nemotron-nano-12b-v2-vl"), "Vision");
  assert.equal(modelModality("openbmb/MiniCPM-V-4_5"), "Vision");
});
test("chat stays Nemotron-only while capability models can be configured independently", async () => {
  const s = new SettingsStore(config).value;
  assert.equal(settingsSchema.safeParse(s).success, true);
  assert.equal(
    settingsSchema.safeParse({ ...s, model: "Qwen/example" }).success,
    false,
  );
  for (const field of ["embeddingModel", "visionModel", "rerankModel"])
    assert.equal(
      settingsSchema.safeParse({ ...s, [field]: "Qwen/example" }).success,
      true,
    );
  assert.equal(
    settingsSchema.safeParse({ ...s, semantic: true }).success,
    false,
  );
  assert.throws(() => requireNemotron("openbmb/MiniCPM-V-4_5"), /Nemotron/);
  assert.throws(
    () => requireNemotron("nvidia/llama-nemotron-embed-1b-v2"),
    /Nemotron/,
  );
  let calls = 0;
  await assert.rejects(
    providerJSON(
      (async () => {
        calls++;
        return Response.json({});
      }) as typeof fetch,
      s.baseUrl + "/embeddings",
      { model: "Qwen/example" },
      s,
    ),
    /Nemotron/,
  );
  assert.equal(calls, 0);
  await providerJSON(
    (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
    s.baseUrl + "/embeddings",
    { model: "google/embeddinggemma-300m" },
    s,
    undefined,
    "embedding",
  );
  assert.equal(calls, 1);
});
test("saved capability models and the provider/key survive reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nemodoc-policy-"));
  try {
    const file = path.join(dir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        ...new SettingsStore(config).value,
        apiKey: "saved-key",
        embeddingModel: "Qwen/example",
        visionModel: "MiniCPM/example",
        rerankModel: "mistral/example",
        semantic: true,
        rerank: true,
      }),
    );
    const s = new SettingsStore(config, file).value;
    assert.equal(s.apiKey, "saved-key");
    assert.equal(s.model, config.model);
    assert.equal(s.embeddingModel, "Qwen/example");
    assert.equal(s.visionModel, "MiniCPM/example");
    assert.equal(s.rerankModel, "mistral/example");
    assert.equal(s.semantic, true);
    assert.equal(s.rerank, true);
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
      throw new Error("Unexpected temp path");
    rmSync(dir, { recursive: true, force: true });
  }
});
