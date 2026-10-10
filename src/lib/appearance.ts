import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("nemodoc-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Keep appearance usable when browser storage is unavailable. */
  }
  return "system";
}

export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (system.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#14161b" : "#f2eee8");
    };
    apply();
    system.addEventListener("change", apply);
    try {
      localStorage.setItem("nemodoc-theme", theme);
    } catch {
      /* Optional preference. */
    }
    return () => system.removeEventListener("change", apply);
  }, [theme]);
  return { theme, setTheme };
}

/** Display the saved model ID without inventing a marketing name. */
export function modelName(id: string) {
  return id
    .split("/")
    .pop()!
    .replace(/(\d)_(\d)/g, "$1.$2")
    .split(/[-_\s]+/)
    .map((part) =>
      /^\d|^[av]\d|^vl$/i.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}
