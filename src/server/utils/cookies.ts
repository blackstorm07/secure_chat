import { secureCookies, sessionCookieName } from "@/lib/security";
import { SESSION_ABSOLUTE_MS } from "@/server/config/constants";

export function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAgeSeconds: number; sameSite: "Lax" | "Strict" },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite}`,
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (secureCookies()) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookie(token: string): string {
  return serializeCookie(sessionCookieName(), token, {
    httpOnly: true,
    maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_MS / 1000),
    sameSite: "Lax",
  });
}

export function clearSessionCookie(): string {
  return serializeCookie(sessionCookieName(), "", {
    httpOnly: true,
    maxAgeSeconds: 0,
    sameSite: "Lax",
  });
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export function withSession(response: Response, token: string): Response {
  response.headers.append("Set-Cookie", sessionCookie(token));
  return response;
}

export function withoutSession(response: Response): Response {
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
