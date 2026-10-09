import test from "node:test";
import assert from "node:assert/strict";
import { requireNemotron } from "../src/lib/model-policy.ts";
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
test("non-Nemotron models cannot be saved or sent to inference", async () => {
  const s = new SettingsStore(config).value;
  assert.equal(settingsSchema.safeParse(s).success, true);
  for (const field of ["model", "embeddingModel", "visionModel", "rerankModel"])
    assert.equal(
      settingsSchema.safeParse({ ...s, [field]: "Qwen/example" }).success,
      false,
    );
  assert.equal(
    settingsSchema.safeParse({ ...s, semantic: true }).success,
    false,
  );
  assert.throws(() => requireNemotron("openbmb/MiniCPM-V-4_5"), /Nemotron/);
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
});
test("legacy capability settings are retired while the saved provider/key survive", () => {
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
    assert.equal(s.embeddingModel, "");
    assert.equal(s.visionModel, "");
    assert.equal(s.rerankModel, "");
    assert.equal(s.semantic, false);
    assert.equal(s.rerank, false);
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
      throw new Error("Unexpected temp path");
    rmSync(dir, { recursive: true, force: true });
  }
});
