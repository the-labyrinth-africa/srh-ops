export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/((?!login|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico|apple-touch-icon|manifest\\.webmanifest|sw\\.js|icons/).*)",
  ],
};
