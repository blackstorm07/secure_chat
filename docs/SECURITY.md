# SecureChat security notes

This document describes what the backend enforces today and what it does not claim.

## What the server is

The server authenticates users, authorizes access to conversations, and stores opaque ciphertext, public keys, and encrypted object metadata. It is a relay. It is not an end-to-end encryption system. No audited messaging protocol is integrated, signed prekeys are not cryptographically verified, and the server cannot prove that a ciphertext is well-formed encryption.

## What the server must not learn

- Plaintext messages. The message schema has no plaintext field. Extra fields are rejected. There is no decryption routine.
- Private identity keys, private prekeys, or media decryption keys. PEM private-key material is rejected. Only public key strings and signatures are stored.
- Raw session tokens. The cookie holds the token. The database stores SHA-256 of it.
- Password plaintext. Passwords are hashed with Argon2id (`memoryCost` 19456, `timeCost` 2, `parallelism` 1 outside tests). The hash field is `select: false` and is removed from JSON transforms. Profile responses are built from an explicit public shape.

Ciphertext and public keys are still sensitive metadata. Logs pass through a denylist that refuses fields such as `password`, `ciphertext`, `token`, `cookie`, and key material. Error responses in production do not include stack traces, MongoDB URIs, or driver errors. Validation errors on sensitive paths say "Invalid value" instead of echoing the input.

## Session and CSRF

| Control | Behavior |
| --- | --- |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_URL` is `https`. Production name is `__Host-session` and no `Domain` attribute is set. |
| Idle expiry | 12 hours, extended at most once a minute while the session is used. |
| Absolute expiry | 30 days from issuance. Refresh does not extend it. |
| Revocation | Logout, expiry, account deactivation, and the 10-session cap. |
| CSRF | Server-side secret compared in constant time with `X-CSRF-Token` on cookie-authenticated mutations. Register and login have no session yet. |
| Storage | Do not put the session token or the CSRF secret in `localStorage`. |

A stolen cookie can still be replayed until revocation. CSRF protection does not stop a caller who can read the JSON body that contains the CSRF secret.

## Account enumeration and abuse limits

Login failures for unknown emails, wrong passwords, and deactivated accounts return the same `401` body. The verifier still runs Argon2 when the account does not exist. Registration conflicts return one generic `409`. Login is limited to 20 attempts per IP and 8 per email hash in 15 minutes. Registration is limited to 5 per IP per hour. Key reads and consumes have separate limits. HTTP bodies are capped at 2 MB, with smaller caps for auth, JSON, key bundles, and message envelopes (64 KiB of ciphertext per envelope, 20 envelopes).

Rate limits use Redis when `REDIS_URL` is set and process memory otherwise. The in-process limiter does not coordinate across machines.

## Authorization

Every conversation and message read checks active membership. Message queries are further limited to envelopes the caller sent or that target the caller's devices. Recipient devices must belong to an active member and have `deviceStatus: "active"`. Revoked devices lose future send and receive. Existing stored envelopes are not rewritten.

Socket identity is the session user plus an owned active device. `message:send` ignores any user id in the payload and rejects a sender device id other than the connected device. Non-members receive `NOT_FOUND`. Delivery is emitted only to `device:{recipientDeviceId}`.

The realtime service allowlists `Origin` and, in production, requires HTTPS. Browser clients send `Origin`. A non-browser client can omit it. The handshake still needs the session cookie or a short-lived realtime ticket. The ticket is an HMAC of the user, session, and device, signed with `SESSION_SECRET`. It is not a second password: the server loads that session and rejects revoked or expired ones. A ticket for one device cannot be presented as another.

## Media

Uploads must declare `application/octet-stream` and a size within 25 MB. The server signs an authenticated raw upload; the API secret never leaves the server. Download URLs are signed and expire after `CLOUDINARY_URL_EXPIRY` seconds (default 300). A download URL is created only for a confirmed attachment whose stored object size matches the row. Membership is required. Only the uploading user can delete the object or confirm it. The browser encrypts media with chunked AES-256-GCM before upload. The API schema rejects a body that includes an encryption key. The server cannot tell that ciphertext from any other opaque blob of the right type and size, and it does not implement the Signal Protocol.

## Headers and CORS

Responses set a strict content security policy (`default-src 'none'`), `nosniff`, `DENY` framing, `no-referrer`, and `no-store`. Production adds HSTS. The realtime process applies Helmet on its health route. CORS reflects only origins listed in `ALLOWED_ORIGINS`, with credentials allowed. Unknown origins are rejected.

In production, client IP rate limiting trusts the first `X-Forwarded-For` value. The edge proxy must overwrite that header. If the API is exposed directly, clients can spoof it.

## Protocol boundary

`SignedPreKeyVerifier.verify` currently checks that identity keys, signed prekeys, and signatures are canonical base64 public material of an accepted length. It returns `cryptographicallyVerified: false`. `MessageProtocolAdapter.validateEnvelope` checks that ciphertext is present and does not decrypt it. Replacing either adapter is the integration point for an audited protocol. Shipping that change does not, by itself, make the product end-to-end encrypted. Clients must implement the protocol, and the deployment must be reviewed against that protocol's threat model.

## Assumptions and limitations

- MongoDB, Redis, Cloudinary, and the application hosts are trusted with ciphertext and social metadata (who talks to whom, when, and which devices exist). A database compromise exposes that metadata and every stored envelope. Cloudinary credentials can read the authenticated files; they are not public and are not prefixed with `NEXT_PUBLIC_`.
- The server cannot detect a malicious client that uploads weakly encrypted or unencrypted bytes that do not match the private-key heuristic.
- One-time prekey consumption is atomic per key. Re-uploading a bundle replaces the previous one-time keys.
- Multi-document message fan-out is validated first, then inserted per envelope. A crash between inserts can leave a partial fan-out. Retries with the same `clientMessageId` deduplicate envelopes that were already stored.
- Object storage credentials in the environment can read and write the bucket. They must be scoped to that bucket and kept out of git.
- Passkeys, group messaging policy, and cryptographic signature checks are not implemented.
- This codebase has not had an independent security audit.
