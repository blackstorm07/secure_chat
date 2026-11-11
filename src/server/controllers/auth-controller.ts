import { jsonSuccess } from "@/lib/api-response";
import { issueRealtimeTicket } from "@/lib/realtime-ticket";
import { clientIp } from "@/lib/security";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { assertRateLimit } from "@/server/middleware/rate-limit";
import { requireOwnedDevice } from "@/server/middleware/authorization";
import { loginAccount, logoutAccount, refreshAccount, registerAccount } from "@/server/services/auth-service";
import { getProfile } from "@/server/services/user-service";
import { AUTH_BODY_BYTES, REALTIME_TICKET_TTL_MS } from "@/server/config/constants";
import { withSession, withoutSession } from "@/server/utils/cookies";
import { parseBody, readJson } from "@/server/utils/http";
import { loginSchema, realtimeTicketSchema, registerSchema } from "@/server/validators/auth";

function userAgent(request: Request): string {
  return request.headers.get("user-agent") ?? "";
}

export async function register(request: Request): Promise<Response> {
  const body = parseBody(registerSchema, await readJson(request, AUTH_BODY_BYTES));
  const result = await registerAccount(body, userAgent(request), clientIp(request));
  return withSession(jsonSuccess(201, "Account created", { user: result.user, csrfToken: result.csrfToken }), result.token);
}

export async function login(request: Request): Promise<Response> {
  const body = parseBody(loginSchema, await readJson(request, AUTH_BODY_BYTES));
  const result = await loginAccount(body, userAgent(request), clientIp(request));
  return withSession(jsonSuccess(200, "Login successful", { user: result.user, csrfToken: result.csrfToken }), result.token);
}

export async function logout(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  await logoutAccount(auth.sessionId);
  return withoutSession(jsonSuccess(200, "Logged out", {}));
}

export async function me(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const user = await getProfile(auth.userId);
  return jsonSuccess(200, "Profile retrieved", { user, csrfToken: auth.csrfToken });
}

export async function realtimeTicket(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(realtimeTicketSchema, await readJson(request, AUTH_BODY_BYTES));
  await assertRateLimit(`realtime-ticket:${auth.userId}`, 30, 60_000);
  await requireOwnedDevice(auth.userId, body.deviceId);
  const ticket = issueRealtimeTicket({
    userId: auth.userId,
    sessionId: auth.sessionId,
    deviceId: body.deviceId,
  });
  return jsonSuccess(200, "Realtime ticket issued", { ticket, expiresIn: REALTIME_TICKET_TTL_MS / 1000 });
}

export async function refresh(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const result = await refreshAccount(auth.sessionId, auth.userId, userAgent(request));
  return withSession(jsonSuccess(200, "Session refreshed", { user: result.user, csrfToken: result.csrfToken }), result.token);
}
