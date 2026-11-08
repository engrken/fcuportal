import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in to upload a profile image." }, { status: 401 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Choose an image file." }, { status: 400 }); }
  const kind = form.get("kind");
  const file = form.get("file");
  if (kind !== "profile" && kind !== "school-logo") return NextResponse.json({ error: "Choose a valid image type." }, { status: 400 });
  if (kind === "school-logo" && user.role !== "TEACHER") return NextResponse.json({ error: "Only a teacher can update the school logo." }, { status: 403 });
  if (!(file instanceof File) || !IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image up to 3 MB." }, { status: 400 });

  let pathname = "";
  try {
    const prefix = kind === "profile" ? `users/${user.id}/profile` : `schools/${user.schoolId}/logo`;
    const blob = await put(`${prefix}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`, file, {
      access: "private", addRandomSuffix: true, contentType: file.type, cacheControlMaxAge: 3600
    });
    pathname = blob.pathname;
    let previousPath: string | null = null;
    if (kind === "profile") {
      const current = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { profileImagePath: true } });
      previousPath = current?.profileImagePath || null;
      await prisma.user.updateMany({ where: { id: user.id, schoolId: user.schoolId }, data: { profileImagePath: pathname } });
    } else {
      const current = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoPath: true } });
      previousPath = current?.logoPath || null;
      await prisma.school.update({ where: { id: user.schoolId }, data: { logoPath: pathname } });
    }
    if (previousPath && previousPath !== pathname) await del(previousPath).catch(() => undefined);
    return NextResponse.json({ ok: true, kind, pathname });
  } catch (error) {
    if (pathname) await del(pathname).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Image upload failed.";
    return NextResponse.json({ error: message.includes("BLOB_READ_WRITE_TOKEN") ? "Image storage is not configured yet. Add the Vercel Blob read/write token to this deployment." : "Image upload failed. Please try again." }, { status: 503 });
  }
}
