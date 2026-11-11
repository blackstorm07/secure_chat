export interface PublicUser {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  accountStatus: "active" | "deactivated";
  chatPinSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: PublicUser;
  csrfToken: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceName: string;
  identityPublicKey: string;
  registrationId: number;
  deviceStatus: "active" | "revoked";
  lastActiveAt: string;
  createdAt: string;
}
