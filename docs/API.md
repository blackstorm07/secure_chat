# SecureChat HTTP and Socket.IO API

All JSON responses use one of these shapes.

Success:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Something went wrong",
  "errorCode": "VALIDATION_ERROR"
}
```

Authenticated mutations require the session cookie and `X-CSRF-Token`. `Content-Type` for bodies is `application/json`. Cookies are HTTP-only. Do not store them, or the CSRF token, in `localStorage`.

The server stores opaque ciphertext and public keys. It does not decrypt messages.

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | No | Creates the account and session. `201`. |
| POST | `/api/v1/auth/login` | No | Same `401` body for unknown users, bad passwords, and deactivated accounts. |
| POST | `/api/v1/auth/logout` | Session + CSRF | Revokes the session and clears the cookie. |
| GET | `/api/v1/auth/me` | Session | Returns the public user and the CSRF token. |
| POST | `/api/v1/auth/refresh` | Session + CSRF | Rotates the cookie. Absolute expiry does not move. |

Register body: `username` (`^[a-z0-9_]{3,32}$`), `email`, `password` (12–128 characters with lower, upper, and a digit).

Login body: `email`, `password`.

Success `data`: `{ "user": PublicUser, "csrfToken": "..." }`. `PublicUser` is `id`, `username`, `email`, `profileImage`, `accountStatus`, `createdAt`, `updatedAt`. `passwordHash` is never included.

## Users

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/users/me` | Session | Public profile. |
| PATCH | `/api/v1/users/me` | Session + CSRF | `username` and/or `profileImage` (`https` URL or `null`). |
| POST | `/api/v1/users/me/deactivate` | Session + CSRF | Body `{ "password" }`. Revokes sessions. Later logins use the generic `401`. |

## Devices

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/devices` | Session + CSRF | Registers a device. |
| GET | `/api/v1/devices` | Session | Lists the caller's devices, including revoked ones. |
| POST | `/api/v1/devices/:id/revoke` | Session + CSRF | Marks the device revoked and notifies its sockets. |

Register body:

```json
{
  "deviceName": "laptop",
  "identityPublicKey": "<base64 public key>",
  "registrationId": 1
}
```

`identityPublicKey` must be canonical base64 or base64url, 32–128 decoded bytes, and must not be a private key. The response device includes that public key, `registrationId`, `deviceStatus`, and timestamps. No private key is accepted or returned.

## Prekeys

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/keys/upload` | Session + CSRF | Replaces the caller's bundle for one owned device. |
| GET | `/api/v1/keys/:userId/:deviceId` | Session | Public bundle. Does not consume a one-time key. |
| POST | `/api/v1/keys/consume` | Session + CSRF | Atomically consumes one one-time public prekey. |

Upload body: `deviceId`, `signedPreKeyId`, `signedPreKeyPublic`, `signedPreKeySignature`, `oneTimePreKeys` (at most 100 `{ keyId, publicKey }` entries with unique ids). The upload response reports counts and `cryptographicallyVerified`. With the built-in adapter that flag is `false`. The upload response does not echo key bytes.

Bundle `data.bundle` includes `identityPublicKey`, `registrationId`, the signed prekey id, public key, and signature, `oneTimePreKeyCount`, and `cryptographicallyVerified`. Revoked devices and missing bundles are `404`.

Consume body: `userId`, `deviceId`, optional `keyId`. Success `data.preKey` is `{ userId, deviceId, keyId, publicKey }`. Consuming the same key again is `409` with `errorCode` `PREKEY_CONSUMED` and no key material.

## Conversations

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/conversations` | Session + CSRF | Direct conversation. `201` or `200` if it already exists. |
| GET | `/api/v1/conversations` | Session | Conversations where the caller is an active member. |
| GET | `/api/v1/conversations/:id` | Session | `404` when the caller is not an active member. |

Body: `{ "conversationType": "direct", "participantUserId": "<id>" }`. `group` is reserved in the schema and rejected by this API. A user cannot open a direct conversation with themselves. `directKey` is not returned.

## Messages

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/messages` | Session + CSRF | Stores one opaque envelope per recipient device. |
| GET | `/api/v1/messages/:conversationId` | Session | Cursor page of envelopes visible to the caller. |
| POST | `/api/v1/messages/:id/delivered` | Session + CSRF | Recipient device owner only. |
| POST | `/api/v1/messages/:id/read` | Session + CSRF | Recipient device owner only. Also sets `deliveredAt` if it was empty. |
| DELETE | `/api/v1/messages/:id` | Session + CSRF | Sender or recipient-device owner, still a member. |

`GET` and `DELETE` share the `/messages/:id` path. `GET` treats the segment as a conversation id. `DELETE` treats it as a message id.

Create body:

```json
{
  "conversationId": "<id>",
  "senderDeviceId": "<id>",
  "clientMessageId": "client-message-1",
  "messageType": "message",
  "protocolVersion": "opaque-1",
  "envelopes": [
    { "recipientDeviceId": "<id>", "ciphertext": "<opaque>" }
  ]
}
```

`messageType` is `prekey`, `message`, or `receipt`. `ciphertext` is 16 to 65536 characters. At most 20 envelopes, with unique recipient devices. Optional `expiresAt` must be within 30 days. Unknown fields, including `plaintext`, fail validation. A duplicate `(senderDeviceId, recipientDeviceId, clientMessageId)` returns the stored envelope with `200` instead of inserting another row.

`GET` query: `cursor` (message id) and `limit` (1–50, default 30). `data` is `{ messages, nextCursor }`. Results are newest first and use `_id` less than the cursor.

Non-members, unknown ids, and receipts from anyone except the active recipient device owner are `404`.

## Media

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/media/upload-url` | Session + CSRF | Signed Cloudinary raw upload for ciphertext. `201`. Rate limited. |
| POST | `/api/v1/media/confirm-upload` | Session + CSRF | Checks the authenticated object, then marks the attachment ready. |
| POST | `/api/v1/media/download-url` | Session + CSRF | Short-lived Cloudinary download for a confirmed attachment. |
| DELETE | `/api/v1/media/:id` | Session + CSRF | Uploading user only. Deletes the Cloudinary object and the row. |

Upload body: `conversationId`, `encryptedSize` (1 through 25 MiB), `encryptedMimeType` exactly `application/octet-stream`. An optional `attachmentId` refreshes the signature for a pending upload the caller owns. Success `data` is `attachmentId`, `objectKey`, `uploadUrl`, `expiresIn`, and `fields`. The object key is a random `m/…` id. It is not a public URL. `fields` contains `api_key`, `timestamp`, `public_id`, `type`, and `signature`. It never contains the API secret.

Confirm and download bodies are `{ "attachmentId" }`. Download `data` is `downloadUrl` and `expiresIn`. A download before confirmation is `409 UPLOAD_INCOMPLETE`. A size or type mismatch is `409 MEDIA_MISMATCH`. Storage that is not configured is `503 STORAGE_UNAVAILABLE`. Non-members and other users' attachments are `404`.

The client encrypts the bytes before the multipart POST. Requests that include an encryption key, nonce, or plaintext field are rejected. Passing the same `attachmentId` back after a rejected signature issues a new signature for the same object.

## Errors

| HTTP | `errorCode` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema, key length, expiry, unavailable recipient device. |
| 401 | `UNAUTHORIZED` | Missing, unknown, expired, or revoked session. |
| 401 | `INVALID_CREDENTIALS` | Login or deactivation password failure. |
| 403 | `CSRF_INVALID` | Missing or wrong CSRF header. |
| 403 | `FORBIDDEN` | Origin rejected, or socket sender device mismatch. |
| 404 | `NOT_FOUND` | Hidden or missing resource. |
| 409 | `CONFLICT` | Duplicate account or profile. |
| 409 | `PREKEY_CONSUMED` | One-time prekey already used. |
| 409 | `MEDIA_MISMATCH` | Object metadata does not match the attachment. |
| 409 | `UPLOAD_INCOMPLETE` | Download requested before the encrypted upload was confirmed. |
| 413 | `PAYLOAD_TOO_LARGE` | Body over the route limit. |
| 415 | `VALIDATION_ERROR` | Content-Type is not JSON. |
| 429 | `RATE_LIMITED` | Login, registration, key, media upload, or socket limit. `Retry-After` is set for HTTP. |
| 503 | `STORAGE_UNAVAILABLE` | Cloudinary is unset or failing. |
| 500 | `INTERNAL_ERROR` | Unexpected failure with no internal detail. |

## Socket.IO

Connect to the realtime process with WebSocket only. Send the session cookie on the handshake and `auth.deviceId` of an active device owned by that session. The server derives the user from the session.

| Event | Direction | Payload |
| --- | --- | --- |
| `connection` / `disconnect` | Transport | Authenticated connect, or socket close. |
| `message:send` | Client to server | Same body as `POST /api/v1/messages`. Ack is the standard success or error object. |
| `message:receive` | Server to recipient device | `{ id, ciphertext, conversationId }`. |
| `message:delivered` | Both | Client sends `{ messageId }`. Server tells the sender device `{ messageId, deliveredAt }`. |
| `message:read` | Both | Client sends `{ messageId }`. Server tells the sender device `{ messageId, readAt, deliveredAt }`. |
| `typing:start` / `typing:stop` | Both | Client sends `{ conversationId }`. Server broadcasts `{ conversationId, userId }` to that conversation. |
| `user:online` / `user:offline` | Server to conversation members | `{ userId }` when the user's first socket connects or last socket leaves. |
| `device:revoked` | Server to that device | `{ deviceId }`, then the socket is closed. |
| `event:error` | Server to client | `{ success: false, message, errorCode }` when the client did not pass an ack. |

Failed authentication closes the handshake with `Authentication failed`. Origins outside `ALLOWED_ORIGINS` are rejected. Each user may hold 5 sockets and each remote address 20. Message sends are limited to 20 per 10 seconds per socket. Other events are limited to 60 per 10 seconds per socket.

`user:online` and `user:offline` are emitted by the server. Clients do not get to assert another user's presence.
