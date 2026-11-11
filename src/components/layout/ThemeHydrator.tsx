"use client";

import { useEffect, type ReactNode } from "react";
import { useThemeStore } from "@/store/theme.store";

export function ThemeHydrator({ children }: { children?: ReactNode }) {
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);
  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);
  return children ?? null;
}
