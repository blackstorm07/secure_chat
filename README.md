# SecureChat

SecureChat is an authenticated message relay. The server stores opaque message ciphertext and public keys. Media files are encrypted in the browser with AES-256-GCM and stored as private Cloudinary raw files. The server does not receive media keys and does not decrypt files.

This repository does not implement the Signal Protocol. Message envelopes stay opaque until a reviewed protocol is integrated in the clients.

## Cloudinary

1. Create a Cloudinary account at https://cloudinary.com/users/register_free.
2. Open the console dashboard. Copy the **Cloud name**, **API Key**, and **API Secret**. The secret is shown in the dashboard; do not put it in client code.
3. Put the values in `.env`. Never prefix them with `NEXT_PUBLIC_` and do not commit `.env`.

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_URL_EXPIRY=300
```

No upload preset is required. The server signs each upload, and the browser sends the ciphertext to Cloudinary as an authenticated raw file. Production startup refuses to boot unless the cloud name, API key, and API secret are set together. Development and tests start without them; media calls then return `503 STORAGE_UNAVAILABLE`.

Stored files appear in the Cloudinary Media Library under the authenticated raw type. That view does not show the original image, because clients upload ciphertext only.

## Run locally

```bash
npm install
npm run dev
npm run dev:realtime
```

The HTTP API listens on port 3000. Socket.IO listens on `REALTIME_PORT` (3001). Set `MONGODB_URI` and `SESSION_SECRET` (at least 32 characters) before starting.

## Test uploads and downloads

Automated tests mock Cloudinary and do not need real credentials:

```bash
npm test
```

With a real bucket, an authenticated conversation member can:

1. `POST /api/v1/media/upload-url` with the encrypted size and `application/octet-stream`.
2. `POST` the ciphertext as multipart form data to the returned Cloudinary URL, including the signed fields.
3. `POST /api/v1/media/confirm-upload` with the attachment id.
4. A member `POST /api/v1/media/download-url` and downloads the ciphertext.

`src/lib/encrypted-media.ts` performs the browser steps: it encrypts the file in 64 KB plaintext chunks, uploads the ciphertext directly to Cloudinary, shows progress through the upload callback, and requests a fresh signature once if Cloudinary rejects it. The AES key stays in the message ciphertext for conversation members. The server never receives it as its own field.

Files larger than 25 MB are rejected. The chunking avoids holding the whole plaintext file at once. The ciphertext for a single PUT is still assembled up to that limit. Multipart upload is not implemented.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```
