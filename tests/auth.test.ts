import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { verifyPassword } from "@/lib/auth";
import { logInfo } from "@/lib/logger";
import { SessionModel } from "@/models/Session";
import { UserModel } from "@/models/User";
import { structuralSignedPreKeyVerifier, opaqueMessageAdapter } from "@/server/services/protocol-adapter";
import { authHeaders, publicKey, registerAccount, sessionCookie, signature, TEST_PASSWORD } from "./support/account";
import { resetDatabase } from "./support/db";
import { createApiServer } from "./support/http";

const api = request(createApiServer());

beforeEach(resetDatabase);

describe("authentication", () => {
  it("registers a user, hashes the password, and hides the hash", async () => {
    const response = await api.post("/api/v1/auth/register").send({
      username: "ada",
      email: "ada@example.com",
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("ada@example.com");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD);
    const cookie = sessionCookie(response);
    expect(cookie.startsWith("session=")).toBe(true);
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const stored = await UserModel.findOne({ email: "ada@example.com" }).select("+passwordHash");
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(await verifyPassword(stored?.passwordHash ?? "", TEST_PASSWORD)).toBe(true);

    const me = await api.get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe("ada");
    expect(me.body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email without creating a second account", async () => {
    await registerAccount(api, "ada", "ada@example.com");
    const duplicate = await api.post("/api/v1/auth/register").send({
      username: "ada_other",
      email: "ada@example.com",
      password: TEST_PASSWORD,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.errorCode).toBe("CONFLICT");
    expect(await UserModel.countDocuments({ email: "ada@example.com" })).toBe(1);
  });

  it("logs in, logs out, and rejects the revoked session", async () => {
    await registerAccount(api, "ada", "ada@example.com");
    const login = await api.post("/api/v1/auth/login").send({ email: "ada@example.com", password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);
    const csrf = login.body.data.csrfToken as string;
    const logout = await api.post("/api/v1/auth/logout").set(authHeaders(cookie, csrf));
    expect(logout.status).toBe(200);
    const me = await api.get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
    expect(me.body.errorCode).toBe("UNAUTHORIZED");
  });

  it("uses the same error for an unknown account and a wrong password", async () => {
    await registerAccount(api, "ada", "ada@example.com");
    const unknown = await api.post("/api/v1/auth/login").send({ email: "missing@example.com", password: TEST_PASSWORD });
    const wrong = await api.post("/api/v1/auth/login").send({ email: "ada@example.com", password: "Wrong-Password-1" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("revokes an expired session", async () => {
    const account = await registerAccount(api, "ada", "ada@example.com");
    await SessionModel.updateMany({ userId: account.userId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await api.get("/api/v1/auth/me").set("Cookie", account.cookie);
    expect(me.status).toBe(401);
    const session = await SessionModel.findOne({ userId: account.userId });
    expect(session?.revokedAt).toBeTruthy();
  });

  it("rotates the session on refresh without extending absolute expiry", async () => {
    const account = await registerAccount(api, "ada", "ada@example.com");
    const original = await SessionModel.findOne({ userId: account.userId, revokedAt: null });
    const refresh = await api.post("/api/v1/auth/refresh").set(authHeaders(account.cookie, account.csrf));
    expect(refresh.status).toBe(200);
    const nextCookie = sessionCookie(refresh);
    expect(nextCookie).not.toBe(account.cookie);
    const active = await SessionModel.findOne({ userId: account.userId, revokedAt: null });
    expect(active?._id.toString()).not.toBe(original?._id.toString());
    expect(active?.absoluteExpiresAt.getTime()).toBe(original?.absoluteExpiresAt.getTime());
    const stale = await api.get("/api/v1/auth/me").set("Cookie", account.cookie);
    expect(stale.status).toBe(401);
    const current = await api.get("/api/v1/auth/me").set("Cookie", nextCookie);
    expect(current.status).toBe(200);
  });

  it("requires a CSRF token for logout", async () => {
    const account = await registerAccount(api, "ada", "ada@example.com");
    const logout = await api.post("/api/v1/auth/logout").set("Cookie", account.cookie);
    expect(logout.status).toBe(403);
    expect(logout.body.errorCode).toBe("CSRF_INVALID");
  });

  it("updates a profile and deactivates the account", async () => {
    const account = await registerAccount(api, "ada", "ada@example.com");
    const updated = await api
      .patch("/api/v1/users/me")
      .set(authHeaders(account.cookie, account.csrf))
      .send({ username: "ada_lovelace" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.user.username).toBe("ada_lovelace");
    expect(updated.body.data.user.passwordHash).toBeUndefined();
    const deactivated = await api
      .post("/api/v1/users/me/deactivate")
      .set(authHeaders(account.cookie, account.csrf))
      .send({ password: TEST_PASSWORD });
    expect(deactivated.status).toBe(200);
    const login = await api.post("/api/v1/auth/login").send({ email: "ada@example.com", password: TEST_PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.message).toBe("Invalid email or password");
  });

  it("refuses to log sensitive fields and does not claim cryptographic verification", async () => {
    expect(() => logInfo({ password: "secret" }, "nope")).toThrow(/sensitive/i);
    const verification = await structuralSignedPreKeyVerifier.verify({
      identityPublicKey: publicKey(),
      signedPreKeyPublic: publicKey(),
      signedPreKeySignature: signature(),
    });
    expect(verification.cryptographicallyVerified).toBe(false);
    expect(structuralSignedPreKeyVerifier.cryptographicVerification).toBe(false);
    expect(opaqueMessageAdapter.cryptographicVerification).toBe(false);
  });
});
