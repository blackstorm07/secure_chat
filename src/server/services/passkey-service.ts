import type { PasskeyCeremony } from "@/types/crypto";

/**
 * WebAuthn ceremonies are not implemented. Authentication currently uses
 * passwords and server-side sessions. A future provider can start registration
 * and authentication without changing the session model.
 */
export interface PasskeyProvider {
  startRegistration(userId: string): Promise<PasskeyCeremony>;
  startAuthentication(): Promise<PasskeyCeremony>;
}

export function createPasskeyProvider(): PasskeyProvider | null {
  return null;
}
