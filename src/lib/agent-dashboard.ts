import type {
  DashboardModelUsage,
  DashboardPrices,
  DashboardTrace,
} from "../agent-dashboard-types";

export function summarizeDashboard(traces: DashboardTrace[], model = "") {
  const models = new Map<string, DashboardModelUsage>();
  for (const trace of traces)
    for (const entry of trace.models) {
      if (model && entry.key !== model) continue;
      const current = models.get(entry.key);
      if (!current) models.set(entry.key, { ...entry });
      else
        for (const key of [
          "calls",
          "responses",
          "failed",
          "promptTokens",
          "completionTokens",
          "usageReports",
        ] as const)
          current[key] += entry[key];
    }
  const usage = [...models.values()].sort(
    (a, b) => b.calls - a.calls || a.model.localeCompare(b.model),
  );
  return {
    models: usage,
    calls: usage.reduce((n, m) => n + m.calls, 0),
    tokens: usage.reduce((n, m) => n + m.promptTokens + m.completionTokens, 0),
    usageReports: usage.reduce((n, m) => n + m.usageReports, 0),
    completed: traces.filter((t) => t.status === "completed").length,
  };
}

export function estimatedCost(
  usage: DashboardModelUsage,
  prices: DashboardPrices,
): number | null {
  const price = prices[usage.key];
  if (!price || usage.usageReports !== usage.calls) return null;
  return (
    (usage.promptTokens * price.inputPerMillion +
      usage.completionTokens * price.outputPerMillion) /
    1e6
  );
}

export function readDashboardPrices(raw: string | null): DashboardPrices {
  try {
    const data = JSON.parse(raw || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([key, value]) => {
        const p = value as DashboardPrices[string];
        return (
          key.length <= 1000 &&
          p &&
          typeof p === "object" &&
          [p.inputPerMillion, p.outputPerMillion].every(
            (n) =>
              typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e6,
          )
        );
      }),
    ) as DashboardPrices;
  } catch {
    return {};
  }
}
