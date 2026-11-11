import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { finish, jsonError, toErrorResponse } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { isAllowedOrigin } from "@/lib/security";
import { MAX_REQUEST_BYTES } from "@/server/config/constants";

export function asyncHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const origin = request.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) {
        return finish(request, jsonError(new AppError(403, "FORBIDDEN", "Origin is not allowed")), requestId);
      }
      const length = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
        throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
      }
      return finish(request, await handler(request), requestId);
    } catch (error) {
      logError(error, "request failed");
      return finish(request, toErrorResponse(error), requestId);
    }
  };
}
