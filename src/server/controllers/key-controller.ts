import { jsonSuccess } from "@/lib/api-response";
import { KEY_BUNDLE_BODY_BYTES } from "@/server/config/constants";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { consumeOneTimePreKey, getKeyBundle, uploadPreKeys } from "@/server/services/prekey-service";
import { parseBody, readJson, requireSegment } from "@/server/utils/http";
import { assertObjectId } from "@/server/utils/ids";
import { consumeKeySchema, uploadKeysSchema } from "@/server/validators/devices";

export async function upload(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(uploadKeysSchema, await readJson(request, KEY_BUNDLE_BODY_BYTES));
  const bundle = await uploadPreKeys(auth.userId, body);
  return jsonSuccess(200, "Keys uploaded", { bundle });
}

export async function show(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const userId = assertObjectId(requireSegment(request, 3), "User");
  const deviceId = assertObjectId(requireSegment(request, 4), "Device");
  const bundle = await getKeyBundle(auth.userId, userId, deviceId);
  return jsonSuccess(200, "Key bundle retrieved", { bundle });
}

export async function consume(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(consumeKeySchema, await readJson(request, KEY_BUNDLE_BODY_BYTES));
  const preKey = await consumeOneTimePreKey(auth.userId, body.userId, body.deviceId, body.keyId);
  return jsonSuccess(200, "One-time prekey consumed", { preKey });
}
