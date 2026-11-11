import { logout } from "@/server/controllers/auth-controller";
import { asyncHandler } from "@/server/middleware/async-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = asyncHandler(logout);
