import { timingSafeEqualString } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { verifyRealtimeTicket } from "@/lib/realtime-ticket";
import { sessionCookieName } from "@/lib/security";
import { authenticateSessionId, authenticateToken, type AuthenticatedSession } from "@/lib/session";
import { readCookie } from "@/server/utils/cookies";

export type AuthContext = AuthenticatedSession;

export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = readCookie(request, sessionCookieName());
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return authenticateToken(token);
}

export async function requireMutationAuth(request: Request): Promise<AuthContext> {
  const auth = await requireAuth(request);
  assertCsrf(request, auth.csrfToken);
  return auth;
}

export function assertCsrf(request: Request, csrfToken: string): void {
  const header = request.headers.get("x-csrf-token") ?? "";
  if (!header || !timingSafeEqualString(header, csrfToken)) {
    throw new AppError(403, "CSRF_INVALID", "CSRF token is missing or invalid");
  }
}

export async function authenticateSocketCookie(cookieHeader: string | undefined): Promise<AuthContext> {
  const token = readCookie(new Request("http://localhost", { headers: cookieHeader ? { cookie: cookieHeader } : {} }), sessionCookieName());
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return authenticateToken(token);
}

export async function authenticateSocket(
  cookieHeader: string | undefined,
  handshake: { deviceId: string; ticket: unknown },
): Promise<AuthContext> {
  if (typeof handshake.ticket === "string" && handshake.ticket.length > 0) {
    const claims = verifyRealtimeTicket(handshake.ticket);
    if (!claims || claims.deviceId !== handshake.deviceId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    return authenticateSessionId(claims.sessionId, claims.userId);
  }
  return authenticateSocketCookie(cookieHeader);
}
