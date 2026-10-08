import type { RuntimeSettings } from "./settings.ts";

export function providerKind(
  url: string,
): "nebius" | "nvidia" | "local" | "custom" {
  const host = new URL(url).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return "local";
  if (/^api\.tokenfactory(?:\.[a-z0-9-]+)?\.nebius\.com$/.test(host))
    return "nebius";
  if (["integrate.api.nvidia.com", "ai.api.nvidia.com"].includes(host))
    return "nvidia";
  return "custom";
}
export function credentialAllowed(url: string, settings: RuntimeSettings) {
  return (
    new URL(url).host === new URL(settings.baseUrl).host ||
    (providerKind(url) === "nvidia" &&
      providerKind(settings.baseUrl) === "nvidia")
  );
}
export function chatOptions(settings: RuntimeSettings) {
  // NVIDIA's extension is not part of the portable OpenAI contract.
  return providerKind(settings.baseUrl) === "nvidia" ||
    (providerKind(settings.baseUrl) === "local" &&
      /nemotron/i.test(settings.model))
    ? { chat_template_kwargs: { enable_thinking: false } }
    : {};
}
