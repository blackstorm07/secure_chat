"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";

export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const error = useAuthStore((state) => state.error);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return { status, user, csrfToken, error, retry: hydrate };
}
