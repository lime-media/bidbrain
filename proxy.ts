import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow API, static, and auth callback routes through
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.next();
  }

  // Check for Supabase auth tokens in cookies
  // Supabase JS with cookie storage sets cookies like: sb-<ref>-auth-token
  const hasAuthToken = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") || c.name.includes("supabase"));

  // Authenticated users hitting /auth/login → redirect to dashboard
  if (pathname.startsWith("/auth/login") && hasAuthToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow login page through for unauthenticated users
  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // Protect all other routes
  if (!hasAuthToken) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
