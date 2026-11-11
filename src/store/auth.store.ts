import { create } from "zustand";
import { ApiError, errorMessage, setSessionPresent, setUnauthorizedHandler } from "@/services/api";
import { currentSession, logoutAccount } from "@/services/auth.service";
import { lockChat } from "@/store/pin.store";
import type { AuthSession, PublicUser } from "@/types/auth";

export type AuthStatus = "unknown" | "authenticated" | "anonymous" | "error";

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  csrfToken: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => void;
  clear: () => void;
  logout: () => Promise<void>;
}

let generation = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "unknown",
  user: null,
  csrfToken: null,
  error: null,
  setSession: (session) => {
    setSessionPresent(true);
    set({ status: "authenticated", user: session.user, csrfToken: session.csrfToken, error: null });
  },
  clear: () => {
    generation += 1;
    setSessionPresent(false);
    set({ status: "anonymous", user: null, csrfToken: null, error: null });
  },
  hydrate: async () => {
    if (get().status === "authenticated" || get().status === "anonymous") return;
    const current = ++generation;
    try {
      const session = await currentSession();
      if (current !== generation) return;
      get().setSession(session);
    } catch (error) {
      if (current !== generation) return;
      if (error instanceof ApiError && (error.status === 401 || error.errorCode === "UNAUTHORIZED")) {
        setSessionPresent(false);
        set({ status: "anonymous", user: null, csrfToken: null, error: null });
        return;
      }
      set({ status: "error", user: null, csrfToken: null, error: errorMessage(error) });
    }
  },
  logout: async () => {
    const csrfToken = get().csrfToken;
    if (!csrfToken) {
      get().clear();
      return;
    }
    await logoutAccount(csrfToken);
    lockChat();
    get().clear();
  },
}));

setUnauthorizedHandler((hadSession) => {
  useAuthStore.getState().clear();
  if (!hadSession || typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/register")) return;
  window.dispatchEvent(new Event("securechat:session-expired"));
});
