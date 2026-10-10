import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "../lib/appearance";

export function AppearanceSettings({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <section className="appearance-settings" aria-label="Appearance">
      <h3>Appearance</h3>
      <div
        className="segmented theme-options"
        role="group"
        aria-label="Color theme"
      >
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            className={theme === value ? "active" : ""}
            aria-pressed={theme === value}
            onClick={() => onChange(value)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
