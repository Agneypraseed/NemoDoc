/** Stable object-key ordering for fingerprints and immutable snapshot comparisons. */
export function canonical(value: unknown): string {
  const normalize = (v: any): any =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .filter((k) => v[k] !== undefined)
              .sort()
              .map((k) => [k, normalize(v[k])]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
