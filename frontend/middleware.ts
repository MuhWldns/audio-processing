import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected routes that require authentication
  const protectedRoutes = ["/audio/studio", "/audio/history", "/profile", "/topup", "/admin", "/dashboard", "/store/cart", "/store/checkout"];

  // Check if the current path is protected
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected) {
    // Check for session cookie (adjust cookie name based on your backend)
    const sessionCookie = request.cookies.get("connect.sid");

    if (!sessionCookie) {
      // Redirect to login with return URL
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/audio/:path*", "/profile", "/topup", "/admin/:path*", "/dashboard/:path*", "/store/cart", "/store/checkout/:path*"],
};
