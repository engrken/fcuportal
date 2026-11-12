import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "This email change link has expired. Sign in and request verification codes from your profile." }, { status: 410 });
}
