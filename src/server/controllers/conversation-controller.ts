import { jsonSuccess } from "@/lib/api-response";
import { JSON_BODY_BYTES } from "@/server/config/constants";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { createDirectConversation, getConversation, listConversations } from "@/server/services/conversation-service";
import { parseBody, readJson, requireSegment } from "@/server/utils/http";
import { assertObjectId } from "@/server/utils/ids";
import { createConversationSchema } from "@/server/validators/messages";

export async function create(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(createConversationSchema, await readJson(request, JSON_BODY_BYTES));
  const result = await createDirectConversation(auth.userId, body.participantUserId);
  return jsonSuccess(result.created ? 201 : 200, result.created ? "Conversation created" : "Conversation already exists", {
    conversation: result.conversation,
  });
}

export async function index(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const conversations = await listConversations(auth.userId);
  return jsonSuccess(200, "Conversations retrieved", { conversations });
}

export async function show(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const conversationId = assertObjectId(requireSegment(request, 3), "Conversation");
  const conversation = await getConversation(auth.userId, conversationId);
  return jsonSuccess(200, "Conversation retrieved", { conversation });
}
