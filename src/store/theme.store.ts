import { create } from "zustand";

export type ThemeName = "dark" | "light";

const THEME_KEY = "securechat-theme";

interface ThemeState {
  theme: ThemeName;
  hydrateTheme: () => void;
  setTheme: (theme: ThemeName) => void;
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",
  hydrateTheme: () => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const theme = stored === "light" ? "light" : "dark";
    applyTheme(theme);
    set({ theme });
  },
  setTheme: (theme) => {
    window.localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));
