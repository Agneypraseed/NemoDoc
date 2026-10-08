import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app.ts";

const app = createApp(
  {
    apiKey: process.env.NEBIUS_API_KEY || process.env.NVIDIA_API_KEY || "",
    baseUrl: process.env.NEBIUS_API_KEY
      ? process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"
      : (process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1"),
    model: process.env.NEBIUS_API_KEY
      ? process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning"
      : (process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-nano-30b-a3b"),
  },
  fetch,
  {
    settingsFile: path.resolve("data/settings.json"),
    agentFile: path.resolve("data/agent.json"),
  },
);
if (existsSync("dist/index.html")) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
const port = Number(process.env.PORT ?? 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(`NemoDoc API ready at http://127.0.0.1:${port}`),
);
