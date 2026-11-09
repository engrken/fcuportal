import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const connectionString =
  process.env.DATABASE_URL ?? process.env.MAIN_POSTGRES_PRISMA_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or MAIN_POSTGRES_PRISMA_URL must be configured.");
}

const databaseUrl = new URL(connectionString);
if (["prefer", "require", "verify-ca"].includes(databaseUrl.searchParams.get("sslmode") || "")) {
  databaseUrl.searchParams.set("sslmode", "verify-full");
}
const adapter = new PrismaPg({ connectionString: databaseUrl.toString() });
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
