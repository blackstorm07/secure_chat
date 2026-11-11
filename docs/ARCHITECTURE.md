# SecureChat backend architecture

SecureChat's server is an authenticated relay and encrypted-data store. It accepts public keys and opaque ciphertext. It does not decrypt messages, and it is not an end-to-end encryption implementation. End-to-end encryption requires a reviewed protocol in the clients. That protocol is not integrated here.

## Processes

Next.js serves the HTTP API. Socket.IO runs in a separate Node process because a persistent WebSocket server does not share a lifecycle with serverless or short-lived Next.js route handlers.

| Process | Command | Role |
| --- | --- | --- |
| HTTP API | `npm run dev` / `npm run start` | App Router routes under `/api/v1` |
| Realtime | `npm run dev:realtime` / `npm run start:realtime` | Socket.IO on `REALTIME_PORT` (default 3001) |

With `REDIS_URL` set, message, receipt, typing, presence, and revocation events are published on the Redis channel `securechat:realtime`. Each realtime process subscribes and delivers to its local sockets. Without Redis, those events stay inside the process that published them. Production deployments with more than one realtime process need Redis.

Put TLS in front of both processes. In production the realtime process rejects socket handshakes that are not TLS and whose `x-forwarded-proto` is not `https`. The proxy must overwrite, not append, forwarded headers.

## Request path

Route files in `src/app/api/v1` are thin. They call controllers, which validate input and call services. Services own business rules. MongoDB access for users and sessions goes through repositories; other aggregates are accessed by their services with Mongoose queries, never string-built queries.

`src/proxy.ts` is the Next.js 16 request proxy (the successor to `middleware.ts`). It applies the security headers, an origin allowlist, and CORS preflight handling. Route handlers repeat those checks so a request that bypasses the proxy still fails closed.

## Layers

- `src/lib` — database connection, Argon2id passwords, session issuance, logging, response helpers.
- `src/server/config` — environment parsing and limits.
- `src/server/controllers` — HTTP adapters.
- `src/server/services` — registration, devices, prekeys, conversations, opaque messages, media, and protocol extension points.
- `src/server/middleware` — authentication, CSRF, authorization, rate limits, and the route error boundary.
- `src/server/sockets` — the standalone Socket.IO server, its local/Redis bus, and event dispatch.
- `src/models` — Mongoose schemas. Indexes are created when the pooled connection opens.

The Mongoose connection is cached on `globalThis` so Next.js hot reload does not open a new pool on every recompilation. Pool size is capped. A failed connect clears the in-flight promise so the next call can retry.

## MongoDB collections

| Collection | Purpose | Notable indexes |
| --- | --- | --- |
| `users` | Account profile and Argon2id password hash | Unique `email`, unique `username` |
| `sessions` | Hashed session token, CSRF secret, idle and absolute expiry, revocation | Unique `tokenHash`, TTL on `absoluteExpiresAt` |
| `devices` | Public identity key and registration id per browser device | Unique `(userId, identityPublicKey)` |
| `prekeys` | Signed prekey and one-time public prekeys for one device | Unique `deviceId` |
| `conversations` | `direct` or future `group` | Unique partial index on `directKey` |
| `conversationmembers` | Membership, role, status | Unique `(conversationId, userId)` |
| `messages` | One opaque envelope per recipient device | Unique `(senderDeviceId, recipientDeviceId, clientMessageId)`, TTL on `expiresAt` |
| `attachments` | Metadata for an encrypted object | Unique `storageKey`, TTL on `expiresAt` |

`directKey` is the two participant ids sorted and joined. Creating the same direct conversation twice returns the existing row. Group rows can be stored by the schema, but the API currently accepts only `conversationType: "direct"`.

A message fan-out is one document per recipient device. The same `clientMessageId` from the same sender device to the same recipient device is stored once.

## Authentication

Registration and login hash passwords with Argon2id and store only the hash. The raw session token is returned in an HTTP-only `SameSite=Lax` cookie (`session` in development, `__Host-session` in production). The cookie value is never stored. The database stores its SHA-256 hash.

The CSRF secret lives on the session row and is returned in the JSON body of register, login, refresh, and `GET /api/v1/auth/me`. State-changing requests send it as `X-CSRF-Token`. Clients should keep that value in memory. It is not an authentication token and it must not be placed in `localStorage`.

Sessions expire after 12 hours idle or 30 days absolute, whichever comes first. Refresh rotates the token and keeps the original absolute expiry. Logout, expiry, deactivation, and the per-user session cap revoke rows. Revoked and expired sessions fail closed with the same `UNAUTHORIZED` response.

Login is rate limited per IP and per email hash. Unknown accounts and wrong passwords return the same `401` body. Registration runs Argon2 even when the email or username already exists, and the conflict response does not say which field collided.

`authMethod` on a session is `password` today. `src/server/services/passkey-service.ts` defines a WebAuthn provider interface and returns null. No passkey ceremony is implemented.

## Devices and prekeys

Each device row holds a public identity key and a registration id. Private keys are rejected if they look like PEM private keys, including values that base64-decode to a private-key header.

`src/server/services/protocol-adapter.ts` exposes `SignedPreKeyVerifier` and `MessageProtocolAdapter`. The defaults check structure only. They set `cryptographicallyVerified` to false and do not verify signatures. A future Signal Protocol (or other audited) integration replaces those adapters. It must not add decryption on the server.

`GET /api/v1/keys/:userId/:deviceId` returns the public bundle and the count of unused one-time prekeys. It does not consume one. `POST /api/v1/keys/consume` atomically sets `consumedAt` with a conditional update. A second consume of the same key returns `409 PREKEY_CONSUMED` and does not return the key again.

## Messages and media

Clients encrypt before upload. The API accepts envelopes of `ciphertext`, `messageType`, and `protocolVersion`. A body field named `plaintext` is rejected by the strict schema, and ciphertext that contains a private-key header is rejected. There is no decrypt function.

The sender user comes from the session. The sender device must belong to that user and be active. Every recipient device must be active and owned by an active conversation member. Revoked devices cannot send or receive new envelopes.

Listing uses `_id` cursor pagination and returns only envelopes the caller sent or that were addressed to one of the caller's devices. Other members, and non-members, do not receive those rows. Deletes are limited to the sender or the recipient device owner, and both must still be conversation members. Missing and forbidden resources use `404` so callers cannot distinguish them.

Media metadata points at an authenticated Cloudinary raw file. The server signs the upload with the API secret and returns only the signature, API key, timestamp, and public id. The browser encrypts the file with AES-256-GCM before the multipart POST. A signed download URL is issued only after the Cloudinary resource matches the stored size and the uploader has confirmed it. The server never receives a media decryption key. Object keys are random `m/…` ids, not file names.

## Realtime

Socket.IO authenticates the handshake cookie with the same session lookup as HTTP. The device id comes from the handshake auth payload and must be an active device owned by that user. Client-supplied user ids are ignored.

Rooms are `user:{id}`, `device:{id}`, and `conversation:{id}`. `message:send` stores envelopes through the message service and publishes `message:receive` to the recipient device room only. Typing and presence are membership-checked. Connection counts are capped per user and per remote address. Events are rate limited per socket. The HTTP buffer is capped at 1.5 MB, matching the message body limit.

## Deployment

1. Set every variable in `.env.example`. `SESSION_SECRET` must be at least 32 characters. Production requires `https` origins, a `mongodb://` or `mongodb+srv://` URI, and the Cloudinary cloud name, API key, and API secret together.
2. Start MongoDB. Start Redis when more than one realtime process will run.
3. Run `npm run build`, then `npm run start` and `npm run start:realtime` behind a TLS proxy.
4. Do not ship `.env` or real credentials.

`npm run typecheck`, `npm run lint`, and `npm test` are the local checks. Tests use an ephemeral MongoDB and an in-memory object store.
