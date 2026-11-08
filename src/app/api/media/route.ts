import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in to view this image." }, { status: 401 });
  const pathname = new URL(request.url).searchParams.get("pathname") || "";
  const allowed = pathname.startsWith(`users/${user.id}/profile/`) || pathname.startsWith(`schools/${user.schoolId}/logo/`);
  if (!allowed) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  try {
    const blob = await get(pathname, { access: "private" });
    if (!blob) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    return new NextResponse(blob.stream, { headers: { "Content-Type": blob.blob.contentType || "application/octet-stream", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", Vary: "Cookie" } });
  } catch {
    return NextResponse.json({ error: "Image could not be loaded." }, { status: 404 });
  }
}
