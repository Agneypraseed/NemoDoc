// The provider catalog gives the model IDs supported by the saved connection.
// These labels describe the input supported by NemoDoc's current endpoints;
// a model family may have other modalities on a different endpoint.
export function modelModality(id: string): "Text" | "Vision" {
  return /(?:[-_]vl(?:[-_]|$)|vision|MiniCPM|pixtral|gemma[-_ ]?[34](?:[-_]|$))/i.test(
    id,
  )
    ? "Vision"
    : "Text";
}

export function modelOptionLabel(id: string, name: string) {
  return `${name} · ${modelModality(id)}`;
}
