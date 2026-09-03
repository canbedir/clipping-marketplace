import { config } from "dotenv";

export default async function setup() {
  config({ path: ".env.test", override: true, quiet: true });

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, pool } = await import("@/server/db");

  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}
