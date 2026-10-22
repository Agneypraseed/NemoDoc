// Opt-in live compatibility check. Never logs or exports provider credentials.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { SettingsStore } from "../server/settings.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { ResearchModels } from "../server/workspace/model-routing.ts";

if (process.env.NEMODOC_RESEARCH_PROBE !== "1")
  throw new Error(
    "Set NEMODOC_RESEARCH_PROBE=1 to authorize live provider calls.",
  );
const env = parse(readFileSync(".env"));
const baseUrl = env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
if (!env.NVIDIA_API_KEY) throw new Error("Configure NVIDIA_API_KEY locally.");
const discovery = await fetch(`${baseUrl}/models`, {
  headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
  signal: AbortSignal.timeout(30000),
});
if (!discovery.ok)
  throw new Error(`Model discovery returned ${discovery.status}.`);
const ids: string[] = (await discovery.json()).data.map(
  (m: { id: string }) => m.id,
);
const requested = (
  process.env.NEMODOC_RESEARCH_MODELS ||
  "nvidia/nemotron-3.5-lightning-30b-a3b,nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b"
).split(",");
const models = new ResearchModels(
  new AgentConnectionStore(
    new SettingsStore({
      baseUrl,
      model: requested[0],
      apiKey: env.NVIDIA_API_KEY,
    }),
  ),
);
const results = [];
for (const [i, model] of requested.entries()) {
  const started = Date.now();
  let error: string | undefined;
  try {
    if (!ids.includes(model))
      throw new Error("Not advertised by the configured NVIDIA endpoint.");
    models.save({
      id: `live-${i}`,
      name: model,
      baseUrl,
      model,
      capabilities: ["research"],
      apiKey: env.NVIDIA_API_KEY,
    });
    await models.test(`live-${i}`, fetch);
  } catch (cause) {
    error = (cause as Error).message
      .split(env.NVIDIA_API_KEY)
      .join("[redacted]");
  }
  const result = { model, ok: !error, durationMs: Date.now() - started, error };
  results.push(result);
  console.log(JSON.stringify(result));
}
mkdirSync("output", { recursive: true });
writeFileSync(
  "output/nemotron-live-probes.json",
  JSON.stringify(
    { at: new Date().toISOString(), provider: baseUrl, results },
    null,
    2,
  ),
);
process.exitCode = results.some((result) => !result.ok) ? 1 : 0;
