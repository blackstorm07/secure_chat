import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const conversationMemberSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "member"], required: true },
    membershipStatus: { type: String, enum: ["active", "left", "removed"], default: "active", required: true },
    joinedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

conversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
conversationMemberSchema.index({ userId: 1, membershipStatus: 1 });

export type ConversationMemberSchema = InferSchemaType<typeof conversationMemberSchema>;
export type ConversationMemberModelType = Model<ConversationMemberSchema>;
export const ConversationMemberModel = ((models.ConversationMember as ConversationMemberModelType | undefined) ??
  model("ConversationMember", conversationMemberSchema)) as ConversationMemberModelType;
