import { NextResponse, type NextRequest } from "next/server";

// Cheap edge check: send visitors without a session cookie to /login.
// The session itself is validated on the server for every page and API call.
const PUBLIC = ["/login", "/signup", "/api/ingest", "/api/cron", "/manifest.webmanifest", "/sw.js", "/icon.svg", "/icons", "/apple-icon"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.has("thrivie_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
