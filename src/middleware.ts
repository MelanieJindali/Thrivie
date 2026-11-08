import { NextResponse, type NextRequest } from "next/server";

// Runs on every request:
// 1. Strict Content Security Policy with a per-request nonce (no inline script
//    runs unless it carries the nonce).
// 2. CSRF protection for cookie-authenticated API writes (same-origin only).
//    Server Actions have their own built-in origin check.
// 3. Redirects visitors without a session cookie to /login. The session itself
//    is validated on the server for every page, action and API call.

const PUBLIC = ["/robots.txt", "/setup", "/login", "/signup", "/privacy", "/api/ingest", "/api/cron", "/manifest.webmanifest", "/sw.js", "/icon.svg", "/icons", "/apple-icon", "/offline"];
const TOKEN_APIS = ["/api/ingest", "/api/cron"]; // bearer-token auth, no cookies
const SESSION_COOKIES = ["__Host-thrivie", "thrivie_session"];

function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    // On-device AI (optional) downloads model files from Hugging Face / GitHub; nothing personal is sent.
    `connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://cas-bridge.xethub.hf.co https://raw.githubusercontent.com${dev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function sameOrigin(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return site === null; // very old browsers without either header
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method) && !TOKEN_APIS.some((p) => pathname.startsWith(p)) && !sameOrigin(req)) {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);
  requestHeaders.set("x-pathname", pathname);

  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  let res: NextResponse;
  if (!isPublic && !hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
