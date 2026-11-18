import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";

import { getSessionMaxMinutes, isSessionValid, sessionConfigFromEnv, type SessionData } from "@/lib/session-core";

const adminPrefix = "/admin";
const protectedPaths = new Set(["/profile", "/change-password"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { cookieName, password } = sessionConfigFromEnv();
  const cookieValue = request.cookies.get(cookieName)?.value;

  let session: SessionData | null = null;
  if (cookieValue) {
    try {
      session = await unsealData<SessionData>(cookieValue, {
        password,
      });
    } catch {
      // Unreadable or expired seal: treated like an invalid session below.
    }
  }

  const isAuthenticated = isSessionValid(session, Date.now(), getSessionMaxMinutes());

  const toLogin = () => {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    // A cookie existed but is no longer valid (expired or old shape): say so
    // and remove it.
    if (cookieValue) loginUrl.searchParams.set("expired", "1");
    const response = NextResponse.redirect(loginUrl);
    if (cookieValue) response.cookies.delete(cookieName);
    return response;
  };

  // A contractor on a temporary password may only reach /change-password.
  // Cookie-only hint; the pages and APIs re-check the database.
  const mustChange = isAuthenticated && session?.user?.mustChangePassword === true;
  if (mustChange && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", request.nextUrl.origin));
  }

  if (pathname.startsWith(adminPrefix)) {
    if (!isAuthenticated) return toLogin();

    if (session?.user?.role !== "admin") {
      const forbiddenUrl = new URL("/profile", request.nextUrl.origin);
      forbiddenUrl.searchParams.set("error", "forbidden");
      return NextResponse.redirect(forbiddenUrl);
    }

    return NextResponse.next();
  }

  if (protectedPaths.has(pathname) && !isAuthenticated) return toLogin();

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile", "/change-password", "/admin/:path*"],
};
