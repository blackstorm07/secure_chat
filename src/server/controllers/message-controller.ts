import { jsonSuccess } from "@/lib/api-response";
import { MESSAGE_BODY_BYTES } from "@/server/config/constants";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { createEncryptedMessages, deleteMessage, listMessages, markDelivered, markRead } from "@/server/services/message-service";
import { parseBody, queryValue, readJson, requireSegment } from "@/server/utils/http";
import { assertObjectId } from "@/server/utils/ids";
import { createMessageSchema, messagePageSchema } from "@/server/validators/messages";

export async function create(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(createMessageSchema, await readJson(request, MESSAGE_BODY_BYTES));
  const result = await createEncryptedMessages(auth.userId, body);
  return jsonSuccess(result.created ? 201 : 200, result.created ? "Message stored" : "Message already stored", {
    messages: result.messages,
  });
}

export async function index(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const conversationId = assertObjectId(requireSegment(request, 3), "Conversation");
  const cursor = queryValue(request, "cursor");
  const limit = queryValue(request, "limit");
  const page = parseBody(messagePageSchema, {
    ...(cursor ? { cursor } : {}),
    ...(limit ? { limit } : {}),
  });
  const result = await listMessages(auth.userId, conversationId, page.cursor, page.limit);
  return jsonSuccess(200, "Messages retrieved", result);
}

export async function delivered(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const message = await markDelivered(auth.userId, assertObjectId(requireSegment(request, 3), "Message"));
  return jsonSuccess(200, "Message marked delivered", { message });
}

export async function read(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const message = await markRead(auth.userId, assertObjectId(requireSegment(request, 3), "Message"));
  return jsonSuccess(200, "Message marked read", { message });
}

export async function remove(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  await deleteMessage(auth.userId, assertObjectId(requireSegment(request, 3), "Message"));
  return jsonSuccess(200, "Message deleted", {});
}
