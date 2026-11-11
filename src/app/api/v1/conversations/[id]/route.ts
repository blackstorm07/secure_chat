import { show } from "@/server/controllers/conversation-controller";
import { asyncHandler } from "@/server/middleware/async-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = asyncHandler(show);
