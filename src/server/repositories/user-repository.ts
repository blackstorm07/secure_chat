import { UserModel } from "@/models/User";
import { objectId } from "@/server/utils/ids";

export async function findUserByEmail(email: string) {
  return UserModel.findOne({ email }).select("+passwordHash +chatPinHash");
}

export async function findUserById(userId: string) {
  return UserModel.findById(objectId(userId));
}

export async function createUser(input: { username: string; email: string; passwordHash: string }) {
  return UserModel.create(input);
}
