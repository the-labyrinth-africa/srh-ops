import withAuth from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse, type NextFetchEvent } from "next/server";

// Export explicite : Next 16 ne reconnaît pas le re-export `export { default } from
// "next-auth/middleware"` (module CommonJS) comme une fonction. Les pages gardent la redirection
// NextAuth ; les API répondent 401 JSON sans session.
export default async function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
  const response = await withAuth(req, event);
  const location = response?.headers.get("location");
  if (!req.nextUrl.pathname.startsWith("/api/") || response?.status !== 307 || !location) {
    return response;
  }

  if (new URL(location, req.url).pathname !== "/api/auth/signin") {
    return response;
  }

  return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
}

export const config = {
  matcher: [
    "/((?!login|forgot-password|reset-password|demande(?:/|$)|api/demandes/publiques(?:/|$)|api/cron/notifications(?:/|$)|api/auth|_next/static|_next/image|favicon.ico|apple-touch-icon|manifest\\.webmanifest|push-sw\\.js|logo-noir\\.png|icons/).*)",
  ],
};
