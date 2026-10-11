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
  // Nemotron's template defaults to thinking on. Token Factory accepts the
  // same template control; answer detail is independent of private reasoning.
  // https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning.html
  return providerKind(settings.baseUrl) === "nvidia" ||
    providerKind(settings.baseUrl) === "nebius" ||
    (providerKind(settings.baseUrl) === "local" &&
      /nemotron/i.test(settings.model))
    ? { chat_template_kwargs: { enable_thinking: false } }
    : {};
}
