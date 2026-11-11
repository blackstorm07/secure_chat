export type AccountStatus = "active" | "deactivated";
export type DeviceStatus = "active" | "revoked";
export type ConversationType = "direct" | "group";
export type MembershipStatus = "active" | "left" | "removed";
export type MemberRole = "owner" | "member";
export type MessageType = "prekey" | "message" | "receipt";
export type SignatureVerification = "structural-only" | "verified";
export type AuthMethod = "password" | "passkey";

export interface MessageDto {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  ciphertext: string;
  messageType: MessageType;
  protocolVersion: string;
  clientMessageId: string;
  createdAt: string;
  expiresAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface DeviceDto {
  id: string;
  userId: string;
  deviceName: string;
  identityPublicKey: string;
  registrationId: number;
  deviceStatus: DeviceStatus;
  lastActiveAt: string;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  conversationType: ConversationType;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    username: string;
    role: MemberRole;
    membershipStatus: MembershipStatus;
    joinedAt: string;
    devices: Array<{
      id: string;
      registrationId: number;
      identityPublicKey: string;
    }>;
  }>;
}
