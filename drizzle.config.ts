import type { Config } from "drizzle-kit";
import { getEnv } from "./src/shared/env";

const env = getEnv();

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: env.DATABASE_URL,
  },
  introspect: {
    casing: "snake_case",
  },
} satisfies Config;
