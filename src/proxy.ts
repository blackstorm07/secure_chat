import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders, documentSecurityHeaders, isAllowedOrigin, securityHeaders } from "@/lib/security";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    const response = NextResponse.json(
      { success: false, message: "Origin is not allowed", errorCode: "FORBIDDEN" },
      { status: 403 },
    );
    applySecurityHeaders(response);
    return response;
  }

  if (request.method === "OPTIONS" && request.nextUrl.pathname.startsWith("/api/")) {
    const response = new NextResponse(null, { status: 204 });
    applyProxyHeaders(response, origin, true);
    return response;
  }

  const response = NextResponse.next();
  applyProxyHeaders(response, origin, request.nextUrl.pathname.startsWith("/api/"), pageHostname(request));
  return response;
}

function pageHostname(request: NextRequest): string {
  const raw = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (!raw) return request.nextUrl.hostname;
  try {
    return new URL(`http://${raw}`).hostname;
  } catch {
    return request.nextUrl.hostname;
  }
}

function applyProxyHeaders(response: NextResponse, origin: string | null, api: boolean, pageHost?: string) {
  const headers = api ? securityHeaders() : documentSecurityHeaders({ hostname: pageHost });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    response.headers.set("Vary", "Origin");
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
