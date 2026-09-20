import withAuth from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import type { NextFetchEvent } from "next/server";

// Export explicite : Next 16 ne reconnaît pas le re-export `export { default } from
// "next-auth/middleware"` (module CommonJS) comme une fonction. Comportement identique : withAuth
// sans option (redirection vers la connexion NextAuth si le jeton de session est absent/invalide).
export default function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
  return withAuth(req, event);
}

export const config = {
  matcher: [
    "/((?!login|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico|apple-touch-icon|manifest\\.webmanifest|sw\\.js|icons/).*)",
  ],
};
