import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const COOKIE_NAME = "bruna_nutri_admin_session";
const SECURITY_PATH = "/dashboard/settings/security";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith("/dashboard");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isLoginPage = pathname === "/login";

  // Only intercept protected paths and the login page
  if (!isDashboard && !isAdminApi && !isLoginPage) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // --- Unauthenticated ---
  if (!session) {
    if (isDashboard) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (isAdminApi) {
      return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
    }
    // /login without session → allow
    return NextResponse.next();
  }

  // --- Authenticated ---

  // Redirect away from /login
  if (isLoginPage) {
    if (session.mustChangePassword) {
      return NextResponse.redirect(new URL(SECURITY_PATH, request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // mustChangePassword: only allow the security page
  if (session.mustChangePassword && isDashboard && pathname !== SECURITY_PATH) {
    return NextResponse.redirect(new URL(SECURITY_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/api/admin/:path*",
  ],
};
