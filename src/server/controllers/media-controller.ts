import { jsonSuccess } from "@/lib/api-response";
import { JSON_BODY_BYTES } from "@/server/config/constants";
import { requireMutationAuth } from "@/server/middleware/auth-middleware";
import { confirmMediaUpload, createMediaDownload, createMediaUpload, deleteMedia } from "@/server/services/media-service";
import { parseBody, readJson, requireSegment } from "@/server/utils/http";
import { assertObjectId } from "@/server/utils/ids";
import { attachmentIdSchema, uploadUrlSchema } from "@/server/validators/messages";

export async function uploadUrl(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(uploadUrlSchema, await readJson(request, JSON_BODY_BYTES));
  const upload = await createMediaUpload(auth.userId, body);
  return jsonSuccess(201, "Upload URL created", upload);
}

export async function confirmUpload(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(attachmentIdSchema, await readJson(request, JSON_BODY_BYTES));
  const attachment = await confirmMediaUpload(auth.userId, body.attachmentId);
  return jsonSuccess(200, "Upload confirmed", attachment);
}

export async function downloadUrl(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(attachmentIdSchema, await readJson(request, JSON_BODY_BYTES));
  const download = await createMediaDownload(auth.userId, body.attachmentId);
  return jsonSuccess(200, "Download URL created", download);
}

export async function remove(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  await deleteMedia(auth.userId, assertObjectId(requireSegment(request, 3), "Attachment"));
  return jsonSuccess(200, "Attachment deleted", {});
}
