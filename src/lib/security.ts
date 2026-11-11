import { getEnv } from "@/server/config/env";

export function securityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cache-Control": "no-store",
  };
  if (getEnv().NODE_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/**
 * Document policy for the web client. API responses keep the strict policy from
 * `securityHeaders`. Inline scripts are limited to the theme bootstrap. Dev adds
 * `unsafe-eval` for the Next.js bundler.
 */
export function documentSecurityHeaders(page?: { hostname?: string | null }): Record<string, string> {
  const headers = securityHeaders();
  const env = getEnv();
  const connect = new Set<string>([
    "'self'",
    "https://api.cloudinary.com",
    "https://res.cloudinary.com",
    "stun:stun.l.google.com:19302",
  ]);
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      connect.add(url.origin);
      connect.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
    } catch {
      // The client reports an invalid realtime URL. Do not widen connect-src.
    }
  }
  if (env.NODE_ENV !== "production") {
    const hosts = new Set<string>();
    hosts.add(new URL(env.APP_URL).hostname);
    if (page?.hostname && isPrivateNetworkHost(page.hostname)) hosts.add(page.hostname);
    for (const host of hosts) {
      const bare = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
      connect.add(`http://${bare}:${env.REALTIME_PORT}`);
      connect.add(`ws://${bare}:${env.REALTIME_PORT}`);
    }
  }
  const scriptSrc = env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  headers["Content-Security-Policy"] = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
  return headers;
}

export function applySecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(securityHeaders())) {
    response.headers.set(name, value);
  }
  return response;
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const numbers = parts.map((part) => Number(part));
  if (!numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return false;
  const first = numbers[0];
  const second = numbers[1];
  if (first === undefined || second === undefined) return false;
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

export function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isPrivateNetworkHost(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (getEnv().origins.includes(origin)) return true;
  return getEnv().NODE_ENV === "development" && isPrivateNetworkOrigin(origin);
}

export function applyCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function clientIp(request: Request): string {
  if (process.env.NODE_ENV === "test") {
    return request.headers.get("x-test-ip") ?? "test-ip";
  }
  if (process.env.NODE_ENV === "production") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const [first] = forwarded.split(",");
      if (first && first.trim()) return first.trim();
    }
  }
  return "local";
}

export function secureCookies(): boolean {
  return getEnv().APP_URL.startsWith("https://");
}

export function sessionCookieName(): string {
  return getEnv().NODE_ENV === "production" ? "__Host-session" : "session";
}
