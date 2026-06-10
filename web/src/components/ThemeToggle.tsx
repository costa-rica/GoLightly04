"use client";

import { useEffect, useId, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "golightly.theme";
const DEFAULT_THEME: Theme = "light";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z"
      />
    </svg>
  );
}

type ThemeToggleProps = {
  variant?: "icon" | "sidebar";
};

export default function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const inputId = useId();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const preferred = stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
    setTheme(preferred);
    applyTheme(preferred);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  if (variant === "sidebar") {
    return (
      <label
        htmlFor={inputId}
        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-calm-700 transition hover:bg-calm-100 focus-within:bg-calm-100 dark:text-calm-200 dark:hover:bg-calm-900 dark:focus-within:bg-calm-900"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-calm-500 dark:text-calm-400">
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </span>
        <span className="flex-1">Theme</span>
        <span className="flex items-center gap-2 text-xs font-semibold text-calm-500 dark:text-calm-400">
          <span>Light</span>
          <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-calm-300 transition dark:bg-primary-700">
            <input
              id={inputId}
              type="checkbox"
              role="switch"
              checked={theme === "dark"}
              onChange={toggleTheme}
              className="peer sr-only"
              aria-label="Use dark theme"
            />
            <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5 motion-reduce:transition-none" />
          </span>
          <span>Dark</span>
        </span>
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-calm-300 text-calm-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
