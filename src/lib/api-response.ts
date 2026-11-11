import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { applySecurityHeaders, isAllowedOrigin } from "@/lib/security";

export function jsonSuccess(status: number, message: string, data: unknown = {}): Response {
  return Response.json({ success: true, message, data }, { status });
}

export function jsonError(error: AppError): Response {
  const body: Record<string, unknown> = {
    success: false,
    message: error.message,
    errorCode: error.errorCode,
  };
  if (error.details !== undefined) body.details = error.details;
  const response = Response.json(body, { status: error.status });
  if (error.retryAfterSeconds) {
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return response;
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) return jsonError(error);
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return jsonError(new AppError(400, "VALIDATION_ERROR", "Validation failed"));
  }
  return jsonError(new AppError(500, "INTERNAL_ERROR", "Something went wrong"));
}

export function finish(request: Request, response: Response, requestId: string): Response {
  applySecurityHeaders(response);
  response.headers.set("x-request-id", requestId);
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    response.headers.set("Vary", "Origin");
  }
  return response;
}
