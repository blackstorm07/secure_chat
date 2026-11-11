import pino from "pino";

const SENSITIVE_KEY = /password|ciphertext|secret|token|private|authorization|cookie|signature|publickey|api[_-]?key|credential|uploadurl|downloadurl|presign|pin/i;

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "securechat" },
  redact: {
    censor: "[redacted]",
    paths: [
      "password",
      "passwordHash",
      "chatPinHash",
      "pin",
      "currentPin",
      "ciphertext",
      "secret",
      "token",
      "sessionToken",
      "csrfToken",
      "authorization",
      "cookie",
      "identityPublicKey",
      "signedPreKeyPublic",
      "signedPreKeySignature",
      "publicKey",
      "oneTimePreKeys",
      "req.headers.cookie",
      "req.headers.authorization",
      "headers.cookie",
      "headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.chatPinHash",
      "*.pin",
      "*.currentPin",
      "*.ciphertext",
      "*.csrfToken",
      "*.identityPublicKey",
      "*.signedPreKeyPublic",
      "*.signedPreKeySignature",
      "*.publicKey",
      "uploadUrl",
      "downloadUrl",
      "*.uploadUrl",
      "*.downloadUrl",
      "fields.signature",
      "fields.api_key",
      "*.signature",
      "*.api_key",
    ],
  },
});

function assertSafeFields(fields: Record<string, unknown>): void {
  for (const key of Object.keys(fields)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new Error("Refusing to log a sensitive field");
    }
  }
}

export function logInfo(fields: Record<string, unknown>, message: string): void {
  assertSafeFields(fields);
  logger.info(fields, message);
}

export function logWarn(fields: Record<string, unknown>, message: string): void {
  assertSafeFields(fields);
  logger.warn(fields, message);
}

export function logError(error: unknown, message: string): void {
  const name = error instanceof Error ? error.name : "Error";
  const safeMessage = safeErrorMessage(error);
  if (process.env.NODE_ENV === "production" || !safeMessage) {
    logger.error({ name }, message);
    return;
  }
  logger.error({ name, errorMessage: safeMessage }, message);
}

function safeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (/mongodb(\+srv)?:\/\//i.test(error.message)) return undefined;
  if (SENSITIVE_KEY.test(error.message)) return undefined;
  return error.message.slice(0, 300);
}
