export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
export const MAX_SESSIONS_PER_USER = 10;

export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const AUTH_BODY_BYTES = 16 * 1024;
export const JSON_BODY_BYTES = 64 * 1024;
export const MESSAGE_BODY_BYTES = 1_500_000;
export const KEY_BUNDLE_BODY_BYTES = 256 * 1024;

export const MAX_CIPHERTEXT_CHARS = 65_536;
export const MAX_ENVELOPES_PER_MESSAGE = 20;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 30;

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const MEDIA_CHUNK_BYTES = 64 * 1024;
export const ATTACHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEDIA_UPLOAD_LIMIT = 30;
export const MEDIA_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export const MAX_ONE_TIME_PREKEYS = 100;
export const MAX_SOCKETS_PER_USER = 5;
export const MAX_SOCKETS_PER_IP = 20;
export const SOCKET_EVENT_LIMIT = 60;
export const SOCKET_EVENT_WINDOW_MS = 10_000;
export const CALL_SIGNAL_LIMIT = 80;
export const CALL_SIGNAL_WINDOW_MS = 10_000;
export const MESSAGE_EVENT_LIMIT = 20;
export const MESSAGE_EVENT_WINDOW_MS = 10_000;

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_ACCOUNT_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const REGISTER_IP_LIMIT = 5;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;
export const KEY_READ_LIMIT = 60;
export const KEY_READ_WINDOW_MS = 60 * 1000;
export const KEY_CONSUME_LIMIT = 30;
export const MESSAGE_EXPIRY_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export const PUBLIC_KEY_MIN_BYTES = 32;
export const PUBLIC_KEY_MAX_BYTES = 128;
export const SIGNATURE_MIN_BYTES = 32;
export const SIGNATURE_MAX_BYTES = 256;

export const ENCRYPTED_MEDIA_MIME_TYPE = "application/octet-stream";
