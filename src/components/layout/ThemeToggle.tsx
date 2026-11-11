"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store/theme.store";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={theme === "light"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-2xl text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]",
        className,
      )}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
