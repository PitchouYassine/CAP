import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

// Global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

export const isSqlConfigured = () => Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME);

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST || "localhost",
      user: process.env.SQL_USER || "postgres",
      password: process.env.SQL_PASSWORD || "",
      database: process.env.SQL_DB_NAME || "postgres",
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    global._postgresPool.on("error", (err) => {
      console.warn("Unexpected error on idle SQL pool client:", err.message);
    });
  }
  return global._postgresPool;
};

let db: ReturnType<typeof drizzle>;
try {
  const pool = createPool();
  db = drizzle(pool, { schema });
} catch {
  console.warn("[AI Studio] Database not connected — using mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  db = new Proxy({} as any, {
    get: (_, prop) =>
      prop === "query"
        ? new Proxy({}, { get: () => noOp })
        : async () => [],
  });
}

export { db };

