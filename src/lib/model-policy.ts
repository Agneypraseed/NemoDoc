// This MVP is intentionally restricted to the NVIDIA Nemotron model family.
export const isNemotron = (model: string) => /nemotron/i.test(model);
export function requireNemotron(model: unknown): asserts model is string {
  if (typeof model !== "string" || !isNemotron(model))
    throw new Error(
      "Choose an available NVIDIA Nemotron model in Settings. Other model families are disabled for this MVP.",
    );
}
