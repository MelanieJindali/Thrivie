import type { MetadataRoute } from "next";

// Personal pages need a signed-in session, so crawlers only ever see the
// sign-in and privacy pages. API routes are excluded outright.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }] };
}
