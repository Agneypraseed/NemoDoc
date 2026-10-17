export function agentConfigRuntime() {
  const agents: Record<
    string,
    {
      name: string;
      model?: { primary?: string; fallbacks?: string[] };
      tools?: unknown;
    }
  > = {
    nemodoc: {
      name: "Study partner",
      model: { primary: "nvidia/study", fallbacks: [] },
    },
    research: {
      name: "Research scout",
      model: { primary: "nvidia/research", fallbacks: ["nvidia/study"] },
    },
  };
  const files = new Map<string, string>([
    [
      "nemodoc:AGENTS.md",
      "# Workspace instructions\n\nKeep existing local conventions.\n",
    ],
    ["nemodoc:SOUL.md", "# Personality\n\nPatient and direct.\n"],
    ["research:AGENTS.md", "# Research agent\n"],
    ["research:SOUL.md", "# Tone\n\nPrecise.\n"],
  ]);
  const calls: { method: string; params: any; args: string[] }[] = [];
  const behavior = { fail: "", badAck: false, unavailable: false };
  let version = 1;
  const run = async (args: string[]) => {
    if (behavior.unavailable)
      throw new Error("Private runtime diagnostic with credentials");
    if (
      args[0] !== "nemodoc" ||
      args[1] !== "exec" ||
      args[2] !== "--" ||
      args[3] !== "openclaw" ||
      args[4] !== "gateway" ||
      args[5] !== "call" ||
      args[7] !== "--params" ||
      args[9] !== "--json"
    )
      throw new Error("Unexpected native command");
    const method = args[6],
      params = JSON.parse(args[8]);
    calls.push({ method, params, args });
    if (behavior.fail === method)
      throw new Error("Private runtime rejection, do not expose");
    let result: unknown;
    if (method === "agents.list")
      result = {
        agents: Object.entries(agents).map(([id, agent]) => ({
          id,
          ...agent,
          workspace: `/sandbox/private/${id}`,
          apiKey: "private-native-key",
        })),
      };
    else if (method === "models.list")
      result = {
        models: [
          {
            id: "study",
            provider: "nvidia",
            name: "NVIDIA Study",
            available: true,
            supportsTools: true,
          },
          {
            id: "research",
            provider: "nvidia",
            name: "NVIDIA Research",
            available: true,
            supportsTools: true,
          },
          {
            id: "gemma",
            provider: "ollama",
            name: "Local Gemma",
            available: true,
            supportsTools: true,
          },
        ],
      };
    else if (method === "config.get")
      result = {
        hash: String(version),
        config: { agents: { entries: agents }, apiKey: "private-native-key" },
        path: "/sandbox/private/openclaw.json",
      };
    else if (method === "config.patch") {
      if (params.baseHash !== String(version))
        throw new Error("Native config conflict");
      const raw = JSON.parse(params.raw);
      for (const [id, update] of Object.entries(raw.agents.entries) as [
        string,
        any,
      ][]) {
        if (!agents[id]) throw new Error("Unknown agent");
        if ("model" in update) agents[id].model = update.model || undefined;
        if ("tools" in update) agents[id].tools = update.tools;
      }
      version++;
      result = behavior.badAck
        ? { error: "ambiguous" }
        : {
            ok: true,
            config: { apiKey: "private-native-key" },
            restart: { scheduled: true },
          };
    } else if (method === "agents.files.get") {
      if (!agents[params.agentId]) throw new Error("Unknown agent");
      const key = `${params.agentId}:${params.name}`;
      result = {
        agentId: params.agentId,
        workspace: "/sandbox/private",
        file: {
          name: params.name,
          path: "/sandbox/private/" + params.name,
          missing: !files.has(key),
          ...(files.has(key) ? { content: files.get(key) } : {}),
        },
      };
    } else if (method === "agents.files.set") {
      if (!agents[params.agentId]) throw new Error("Unknown agent");
      files.set(`${params.agentId}:${params.name}`, params.content);
      result = { ok: true, agentId: params.agentId };
    } else if (method === "agents.update") {
      if (!agents[params.agentId]) throw new Error("Unknown agent");
      agents[params.agentId].name = params.name;
      result = { ok: true, agentId: params.agentId };
    } else if (method === "agents.create") {
      const id = params.name.toLowerCase().replace(/ +/g, "-");
      if (agents[id]) throw new Error("Already exists");
      agents[id] = { name: params.name };
      files.set(`${id}:AGENTS.md`, "# Native bootstrap instructions\n");
      result = {
        ok: true,
        agentId: id,
        name: params.name,
        workspace: `/sandbox/private/${id}`,
      };
    } else throw new Error("Unexpected RPC");
    return JSON.stringify(result);
  };
  return { agents, files, calls, behavior, run };
}
