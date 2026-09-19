import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import type { Db } from "@/db/queries";
import * as schema from "@/db/schema";

/** The D1 binding, wrapped for Drizzle. Server-only: `env` has no meaning in the browser. */
export function getDb(): Db {
  return drizzle(env.DB, { schema });
}
