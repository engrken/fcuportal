import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function explicitSslVerification(connectionString: string) {
  const url = new URL(connectionString);
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") || "")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

// Only Prisma CLI uses this elevated, unpooled migration connection.\n// Runtime queries continue using the restricted DATABASE_URL credential.\nconst directUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.MAIN_POSTGRES_URL_NON_POOLING ?? env("DIRECT_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: explicitSslVerification(directUrl)
  }
});
