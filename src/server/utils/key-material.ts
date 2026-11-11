import { AppError } from "@/lib/errors";

const PRIVATE_KEY_MARKER = /BEGIN [A-Z0-9 ]*PRIVATE|PRIVATE KEY|OPENSSH PRIVATE/i;

export function assertPublicKeyMaterial(value: string, minimumBytes: number, maximumBytes: number, label: string): string {
  if (PRIVATE_KEY_MARKER.test(value)) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} must be public key material`);
  }
  const decoded = decodeKey(value);
  if (!decoded) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} must be base64-encoded public key material`);
  }
  if (PRIVATE_KEY_MARKER.test(decoded.toString("utf8"))) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} must be public key material`);
  }
  if (decoded.length < minimumBytes || decoded.length > maximumBytes) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} has an invalid length`);
  }
  return value;
}

function decodeKey(value: string): Buffer | null {
  const compact = value.trim();
  if (!compact || /\s/.test(compact)) return null;
  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(padded)) return null;
  const decoded = Buffer.from(padded, "base64");
  if (decoded.length === 0) return null;
  const canonical = decoded.toString("base64").replace(/=+$/, "");
  const received = normalized.replace(/=+$/, "");
  if (canonical !== received) return null;
  return decoded;
}
