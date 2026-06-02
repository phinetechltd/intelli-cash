"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "@/lib/theme-icons";

type ThemeMode = "dark" | "light";

const storageKey = "intellicash-theme";

function readStoredTheme(): ThemeMode | null {
  try {
    const getItem = window.localStorage?.getItem;
    if (typeof getItem !== "function") return null;

    const stored = getItem.call(window.localStorage, storageKey);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: ThemeMode) {
  try {
    const setItem = window.localStorage?.setItem;
    if (typeof setItem === "function") setItem.call(window.localStorage, storageKey, theme);
  } catch {
    // Storage can be unavailable in embedded browsers or test environments.
  }
}

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const current = document.documentElement.dataset.theme;
  if (current === "dark" || current === "light") return current;

  const stored = readStoredTheme();
  if (stored) return stored;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  storeTheme(theme);

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#07110c" : "#1f7a36";

  window.dispatchEvent(new CustomEvent("intellicash:theme-change", { detail: theme }));
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    setTheme(preferredTheme);
    applyTheme(preferredTheme);

    function syncTheme(event: Event) {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      if (nextTheme === "dark" || nextTheme === "light") setTheme(nextTheme);
    }

    window.addEventListener("intellicash:theme-change", syncTheme as EventListener);
    return () => {
      window.removeEventListener("intellicash:theme-change", syncTheme as EventListener);
    };
  }, []);

  const isDark = theme === "dark";
  const nextTheme: ThemeMode = isDark ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={isDark}
      className={`theme-toggle ${compact ? "compact" : ""}`}
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      title={`Switch to ${nextTheme} theme`}
      type="button"
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{isDark ? <Moon size={14} /> : <Sun size={14} />}</span>
      </span>
      <span className="theme-toggle-label">{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
