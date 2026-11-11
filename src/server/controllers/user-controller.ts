import { jsonSuccess } from "@/lib/api-response";
import { AUTH_BODY_BYTES, JSON_BODY_BYTES } from "@/server/config/constants";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { assertRateLimit } from "@/server/middleware/rate-limit";
import { deactivateAccount, getProfile, setChatPin, updateProfile, verifyChatPin } from "@/server/services/user-service";
import { parseBody, readJson } from "@/server/utils/http";
import { chatPinSchema, deactivateSchema, profileSchema, verifyChatPinSchema } from "@/server/validators/auth";

export async function showProfile(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const user = await getProfile(auth.userId);
  return jsonSuccess(200, "Profile retrieved", { user });
}

export async function patchProfile(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(profileSchema, await readJson(request, JSON_BODY_BYTES));
  const user = await updateProfile(auth.userId, body);
  return jsonSuccess(200, "Profile updated", { user });
}

export async function saveChatPin(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(chatPinSchema, await readJson(request, AUTH_BODY_BYTES));
  const user = await setChatPin(auth.userId, body.pin, body.currentPin);
  return jsonSuccess(200, "Chat PIN saved", { user });
}

export async function checkChatPin(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  await assertRateLimit(`chat-pin:${auth.userId}`, 8, 15 * 60 * 1000);
  const body = parseBody(verifyChatPinSchema, await readJson(request, AUTH_BODY_BYTES));
  await verifyChatPin(auth.userId, body.pin);
  return jsonSuccess(200, "Chat PIN accepted", {});
}

export async function deactivate(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(deactivateSchema, await readJson(request, AUTH_BODY_BYTES));
  await deactivateAccount(auth.userId, body.password);
  return jsonSuccess(200, "Account deactivated", {});
}
