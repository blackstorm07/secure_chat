import {
  PUBLIC_KEY_MAX_BYTES,
  PUBLIC_KEY_MIN_BYTES,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_MIN_BYTES,
} from "@/server/config/constants";
import { assertPublicKeyMaterial } from "@/server/utils/key-material";
import type { MessageProtocolAdapter, OpaqueEnvelope, SignedPreKeyVerifier } from "@/types/crypto";

/**
 * Structural checks only. This adapter does not verify signatures and does not
 * implement a messaging protocol. A future audited implementation can replace it.
 */
export const structuralSignedPreKeyVerifier: SignedPreKeyVerifier = {
  cryptographicVerification: false,
  async verify(input) {
    assertPublicKeyMaterial(input.identityPublicKey, PUBLIC_KEY_MIN_BYTES, PUBLIC_KEY_MAX_BYTES, "Identity public key");
    assertPublicKeyMaterial(input.signedPreKeyPublic, PUBLIC_KEY_MIN_BYTES, PUBLIC_KEY_MAX_BYTES, "Signed prekey");
    assertPublicKeyMaterial(input.signedPreKeySignature, SIGNATURE_MIN_BYTES, SIGNATURE_MAX_BYTES, "Signed prekey signature");
    return { accepted: true, cryptographicallyVerified: false };
  },
};

/**
 * Accepts an opaque envelope. It does not decrypt ciphertext.
 */
export const opaqueMessageAdapter: MessageProtocolAdapter = {
  name: "opaque-envelope",
  cryptographicVerification: false,
  async validateEnvelope(envelope: OpaqueEnvelope) {
    if (!envelope.ciphertext || envelope.ciphertext.length < 16) {
      throw new Error("Envelope ciphertext is missing");
    }
  },
};

let signedPreKeyVerifier: SignedPreKeyVerifier = structuralSignedPreKeyVerifier;
let messageAdapter: MessageProtocolAdapter = opaqueMessageAdapter;

export function setSignedPreKeyVerifier(verifier: SignedPreKeyVerifier): void {
  signedPreKeyVerifier = verifier;
}

export function setMessageProtocolAdapter(adapter: MessageProtocolAdapter): void {
  messageAdapter = adapter;
}

export function getSignedPreKeyVerifier(): SignedPreKeyVerifier {
  return signedPreKeyVerifier;
}

export function getMessageProtocolAdapter(): MessageProtocolAdapter {
  return messageAdapter;
}
