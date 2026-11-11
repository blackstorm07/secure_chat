export class AppError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    errorCode: string,
    message: string,
    options?: { details?: unknown; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = options?.details;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}
