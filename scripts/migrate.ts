import "dotenv/config";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "@/server/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
