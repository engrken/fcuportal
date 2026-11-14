import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Defense in depth for guest users on real SAGA pages. Demo tokens are signed
 * by the same AUTH_SECRET but are NEVER allowed to mutate production APIs.
 * Route handlers still apply their own role and school ownership checks.
 */
export async function proxy(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path === "/api/auth/demo" || path === "/api/auth/logout") return NextResponse.next();

  const token = request.cookies.get("fcu_portal_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret || secret.length < 32) return NextResponse.next();

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (payload.demo === true) {
      return NextResponse.json(
        { error: "This is the real SAGA interface in read-only demo mode. Saving changes is disabled. Switch to your own account to edit records." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch {
    // Invalid session cookies are rejected by the API's existing authorization.
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
