import { AppError } from "@/lib/errors";
import type { ZodError, ZodType } from "zod";

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "VALIDATION_ERROR", "Content-Type must be application/json");
  }
  const advertised = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  if (buffer.byteLength === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Request body is required");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as unknown;
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Validation failed", {
      details: sanitizeIssues(result.error),
    });
  }
  return result.data;
}

function sanitizeIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    const sensitive = /password|ciphertext|signature|publickey|secret|token/i.test(path);
    return { path, message: sensitive ? "Invalid value" : issue.message };
  });
}

export function requestSegments(request: Request): string[] {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  return pathname.split("/").filter(Boolean);
}

export function requireSegment(request: Request, index: number): string {
  const segment = requestSegments(request)[index];
  if (!segment) {
    throw new AppError(400, "VALIDATION_ERROR", "Missing path parameter");
  }
  return decodeURIComponent(segment);
}

export function queryValue(request: Request, name: string): string | null {
  const value = new URL(request.url).searchParams.get(name);
  return value === null || value === "" ? null : value;
}
