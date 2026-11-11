import { jsonSuccess } from "@/lib/api-response";
import { JSON_BODY_BYTES } from "@/server/config/constants";
import { requireAuth, requireMutationAuth } from "@/server/middleware/auth-middleware";
import { listDevices, registerDevice, revokeDevice } from "@/server/services/device-service";
import { parseBody, readJson, requireSegment } from "@/server/utils/http";
import { assertObjectId } from "@/server/utils/ids";
import { registerDeviceSchema } from "@/server/validators/devices";

export async function createDevice(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const body = parseBody(registerDeviceSchema, await readJson(request, JSON_BODY_BYTES));
  const device = await registerDevice(auth.userId, body);
  return jsonSuccess(201, "Device registered", { device });
}

export async function showDevices(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  const devices = await listDevices(auth.userId);
  return jsonSuccess(200, "Devices retrieved", { devices });
}

export async function revoke(request: Request): Promise<Response> {
  const auth = await requireMutationAuth(request);
  const deviceId = assertObjectId(requireSegment(request, 3), "Device");
  const device = await revokeDevice(auth.userId, deviceId);
  return jsonSuccess(200, "Device revoked", { device });
}
