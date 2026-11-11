import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const conversationSchema = new Schema(
  {
    conversationType: { type: String, enum: ["direct", "group"], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    directKey: { type: String, default: null, maxlength: 80 },
  },
  { timestamps: true },
);

conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: "string" } } },
);

export type ConversationSchema = InferSchemaType<typeof conversationSchema>;
export type ConversationModelType = Model<ConversationSchema>;
export const ConversationModel = ((models.Conversation as ConversationModelType | undefined) ??
  model("Conversation", conversationSchema)) as ConversationModelType;
