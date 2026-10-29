export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <path d="M6 21V7h3l10 14h3V7h-3v9L9 7" />
      </svg>
    </span>
  );
}
