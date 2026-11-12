import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function checkAuthThrottle(request: Request, identity: string, limit: number, windowMs = 15 * 60 * 1000, scope: "network" | "identity" = "network") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const digest = createHash("sha256").update(`${identity.toLowerCase()}|${scope === "identity" ? "all-networks" : forwarded}`).digest("hex");
  const now = new Date();
  await prisma.authThrottle.deleteMany({ where: { key: digest, resetAt: { lte: now } } });
  const entry = await prisma.authThrottle.upsert({
    where: { key: digest }, create: { key: digest, attempts: 1, resetAt: new Date(now.getTime() + windowMs) },
    update: { attempts: { increment: 1 } }
  });
  return { allowed: entry.attempts <= limit, key: digest };
}

export async function clearAuthThrottle(key: string) {
  await prisma.authThrottle.deleteMany({ where: { key } });
}
