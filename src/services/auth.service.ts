import { apiRequest } from "@/services/api";
import type { AuthSession, PublicUser } from "@/types/auth";

export function registerAccount(input: { username: string; email: string; password: string }): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/v1/auth/register", { method: "POST", body: input });
}

export function loginAccount(input: { email: string; password: string }): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: input,
    allowUnauthorized: true,
  });
}

export function logoutAccount(csrfToken: string): Promise<Record<string, never>> {
  return apiRequest<Record<string, never>>("/api/v1/auth/logout", { method: "POST", csrfToken, body: {} });
}

export function currentSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/v1/auth/me", { allowUnauthorized: true });
}

export function refreshSession(csrfToken: string): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/v1/auth/refresh", { method: "POST", csrfToken, body: {} });
}

export function updateProfile(
  csrfToken: string,
  input: { username?: string; profileImage?: string | null },
): Promise<{ user: PublicUser }> {
  return apiRequest<{ user: PublicUser }>("/api/v1/users/me", { method: "PATCH", csrfToken, body: input });
}

export function saveChatPin(csrfToken: string, pin: string, currentPin?: string): Promise<{ user: PublicUser }> {
  return apiRequest<{ user: PublicUser }>("/api/v1/users/me/pin", {
    method: "POST",
    csrfToken,
    body: currentPin ? { pin, currentPin } : { pin },
  });
}

export function verifyChatPin(csrfToken: string, pin: string): Promise<Record<string, never>> {
  return apiRequest<Record<string, never>>("/api/v1/users/me/pin/verify", {
    method: "POST",
    csrfToken,
    body: { pin },
  });
}

export function deactivateAccount(csrfToken: string, password: string): Promise<Record<string, never>> {
  return apiRequest<Record<string, never>>("/api/v1/users/me/deactivate", {
    method: "POST",
    csrfToken,
    body: { password },
    allowUnauthorized: true,
  });
}
