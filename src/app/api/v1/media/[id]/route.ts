import { remove } from "@/server/controllers/media-controller";
import { asyncHandler } from "@/server/middleware/async-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = asyncHandler(remove);
