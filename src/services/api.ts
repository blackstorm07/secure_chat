export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly details?: unknown;

  constructor(status: number, errorCode: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

interface ApiFailure {
  success: false;
  message: string;
  errorCode: string;
  details?: unknown;
}

type UnauthorizedHandler = (hadSession: boolean) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let sessionPresent = false;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export function setSessionPresent(present: boolean): void {
  sessionPresent = present;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "Cancelled";
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  csrfToken?: string | null;
  signal?: AbortSignal;
  allowUnauthorized?: boolean;
  retryGet?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  try {
    return await send<T>(path, method, options);
  } catch (error) {
    if (options.retryGet !== false && method === "GET" && error instanceof ApiError && error.status === 0) {
      return send<T>(path, method, options);
    }
    throw error;
  }
}

async function send<T>(path: string, method: NonNullable<RequestOptions["method"]>, options: RequestOptions): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.csrfToken && method !== "GET") headers.set("x-csrf-token", options.csrfToken);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Network request failed");
  }

  const text = await response.text();
  const payload = text ? parsePayload(text) : null;
  if (!response.ok || !payload || payload.success !== true) {
    const failure = payload && payload.success === false ? payload : null;
    if (response.status === 401 && !options.allowUnauthorized) {
      const hadSession = sessionPresent;
      sessionPresent = false;
      unauthorizedHandler?.(hadSession);
    }
    throw new ApiError(response.status, failure?.errorCode ?? "REQUEST_FAILED", failure?.message ?? "Request failed", failure?.details);
  }
  return payload.data as T;
}

function parsePayload(text: string): ApiSuccess<unknown> | ApiFailure | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.success === true) {
      return { success: true, message: typeof record.message === "string" ? record.message : "OK", data: record.data };
    }
    if (record.success === false && typeof record.message === "string" && typeof record.errorCode === "string") {
      return { success: false, message: record.message, errorCode: record.errorCode, details: record.details };
    }
    return null;
  } catch {
    return null;
  }
}
