import { AttachmentModel } from "@/models/Attachment";
import { ConversationModel } from "@/models/Conversation";
import { ConversationMemberModel } from "@/models/ConversationMember";
import { DeviceModel } from "@/models/Device";
import { MessageModel } from "@/models/Message";
import { PreKeyModel } from "@/models/PreKey";
import { SessionModel } from "@/models/Session";
import { UserModel } from "@/models/User";

const models = [
  UserModel,
  SessionModel,
  DeviceModel,
  PreKeyModel,
  ConversationModel,
  ConversationMemberModel,
  MessageModel,
  AttachmentModel,
];

export async function createModelIndexes(): Promise<void> {
  await Promise.all(models.map((item) => item.createIndexes()));
}
