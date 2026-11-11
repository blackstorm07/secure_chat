export interface SignedPreKeyVerificationInput {
  identityPublicKey: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
}

export interface SignedPreKeyVerification {
  accepted: boolean;
  cryptographicallyVerified: boolean;
}

/**
 * Extension point for a future audited protocol implementation.
 * The server never receives or returns private keys.
 */
export interface SignedPreKeyVerifier {
  readonly cryptographicVerification: boolean;
  verify(input: SignedPreKeyVerificationInput): Promise<SignedPreKeyVerification>;
}

export interface OpaqueEnvelope {
  messageType: string;
  protocolVersion: string;
  ciphertext: string;
}

/**
 * Extension point for future Signal Protocol (or another audited protocol) checks.
 * Implementations must treat ciphertext as opaque and must not decrypt it.
 */
export interface MessageProtocolAdapter {
  readonly name: string;
  readonly cryptographicVerification: boolean;
  validateEnvelope(envelope: OpaqueEnvelope): Promise<void>;
}

export interface PasskeyCeremony {
  challenge: string;
  userId: string;
}
