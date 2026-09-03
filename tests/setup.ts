import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";

import { db, pool } from "@/server/db";

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE submission_metrics, submissions, campaigns, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});
