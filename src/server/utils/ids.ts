import { AppError } from "@/lib/errors";
import { Types } from "mongoose";

const OBJECT_ID = /^[a-f\d]{24}$/i;

export function assertObjectId(value: string, label = "Identifier"): string {
  if (!OBJECT_ID.test(value)) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} is invalid`);
  }
  return value;
}

export function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(assertObjectId(value));
}
