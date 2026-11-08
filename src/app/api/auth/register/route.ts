import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";

const bodySchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(100, "Password must be 100 characters or less."),
  role: z.enum(["TEACHER", "STUDENT"]),
  // FormData.get() returns null for a role-specific field that is not rendered.
  studentNumber: z.string().trim().max(40).nullish(),
  inviteCode: z.string().trim().nullish(),
  acknowledgedPrivacyNotice: z.literal(true, {
    errorMap: () => ({ message: "Please acknowledge the Privacy Notice." })
  })
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Please check your information." },
        { status: 400 }
      );
    }

    const { fullName, email, password, role, studentNumber, inviteCode } = parsed.data;
    const throttle = await checkAuthThrottle(request, `register:${email}`, 4);
    if (!throttle.allowed) {
      return NextResponse.json(
        { error: "Too many account creation attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    if (
      role === "TEACHER" &&
      (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE)
    ) {
      return NextResponse.json(
        { error: "Teacher registration requires an invitation code from the portal owner." },
        { status: 403 }
      );
    }

    if (role === "STUDENT" && !studentNumber) {
      return NextResponse.json({ error: "Student number is required." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        fullName,
        email: email.toLowerCase(),
        passwordHash,
        role,
        studentNumber: role === "STUDENT" ? studentNumber : null,
        privacyNoticeAcceptedAt: new Date()
      },
      select: { id: true, role: true }
    });

    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account already uses that email or student number." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
