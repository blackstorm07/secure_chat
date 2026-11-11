import { randomBytes } from "node:crypto";
import type { Response } from "supertest";
import type TestAgent from "supertest/lib/agent";

export const TEST_PASSWORD = "Correct-Horse-1";

export function publicKey(): string {
  return randomBytes(32).toString("base64url");
}

export function signature(): string {
  return randomBytes(64).toString("base64url");
}

export function sessionCookie(response: Response): string {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((cookie) => cookie.startsWith("session="));
  if (!match) throw new Error("Session cookie was not set");
  return match.split(";")[0] ?? "";
}

export function authHeaders(cookie: string, csrf: string): { Cookie: string; "X-CSRF-Token": string } {
  return { Cookie: cookie, "X-CSRF-Token": csrf };
}

export async function registerAccount(api: TestAgent, username: string, email: string) {
  const response = await api.post("/api/v1/auth/register").send({ username, email, password: TEST_PASSWORD });
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    response,
    userId: response.body.data.user.id as string,
    csrf: response.body.data.csrfToken as string,
    cookie: sessionCookie(response),
  };
}
