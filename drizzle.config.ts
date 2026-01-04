import type { Config } from "drizzle-kit";
import { getEnv } from "./src/shared/env";

const env = getEnv();

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  introspect: {
    casing: "preserve",
  },
} satisfies Config;
