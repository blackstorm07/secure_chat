import { checkChatPin } from "@/server/controllers/user-controller";
import { asyncHandler } from "@/server/middleware/async-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = asyncHandler(checkChatPin);
