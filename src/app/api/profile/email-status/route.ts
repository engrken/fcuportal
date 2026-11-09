import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { emailDeliveryConfigured, verifyPortalEmailConnection } from "@/lib/mailer";
import { checkAuthThrottle } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in to check the email connection." }, { status: 401 });
  const throttle = await checkAuthThrottle(request, `email-status:${user.id}`, 3);
  if (!throttle.allowed) return NextResponse.json({ error: "Please wait before checking the mail connection again." }, { status: 429 });
  if (!emailDeliveryConfigured()) return NextResponse.json({ error: "SMTP settings are incomplete. The sender account and password must both be configured." }, { status: 503 });
  try {
    await verifyPortalEmailConnection();
    return NextResponse.json({ ok: true, message: "SMTP connection and authentication succeeded. No email was sent." });
  } catch (error) {
    console.error("SMTP connection check failed", error);
    return NextResponse.json({ error: "SMTP connection failed. Check the host, port, TLS mode, username, and app password in Vercel." }, { status: 503 });
  }
}
