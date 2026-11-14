import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { DEMO_SCHOOL_ID, DEMO_SCHOOL_SLUG, DEMO_USER_IDS } from "@/lib/demo-access";

const inputSchema = z.object({ role: z.enum(["TEACHER", "STUDENT"]) });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Same-origin only; do not allow other sites to force guest sign-ins.
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-site demo sign-in is not allowed." }, { status: 403 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose Teacher or Student." }, { status: 400 });

  const throttle = await checkAuthThrottle(request, "public-demo-session", 30);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many demo sessions. Please try again later." }, { status: 429 });

  const school = await prisma.school.findUnique({
    where: { id: DEMO_SCHOOL_ID },
    select: { id: true, slug: true, isActive: true, subscriptionStatus: true }
  });
  if (!school || school.slug !== DEMO_SCHOOL_SLUG || !school.isActive || school.subscriptionStatus !== "ACTIVE") {
    return NextResponse.json({ error: "The sample college is temporarily unavailable." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: DEMO_USER_IDS[parsed.data.role] },
    select: { id: true, role: true, schoolId: true, emailVerifiedAt: true, emailIdentityChangedAt: true }
  });
  if (!user || user.schoolId !== school.id || user.role !== parsed.data.role || !user.emailVerifiedAt) {
    return NextResponse.json({ error: "Sample accounts have not been initialized." }, { status: 503 });
  }
  await createSession(user, false, true);
  return NextResponse.json({ ok: true, redirect: "/" + DEMO_SCHOOL_SLUG + "/overview" },
    { headers: { "Cache-Control": "private, no-store" } });
}
