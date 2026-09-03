import "dotenv/config";

import { z } from "zod";

import { db, pool } from "@/server/db";
import { runIngest, today } from "@/server/services/ingest";

const dateArg = z.iso.date().optional();

async function main() {
  const parsed = dateArg.safeParse(process.argv[2]);
  if (!parsed.success) {
    throw new Error("Usage: pnpm ingest [YYYY-MM-DD]");
  }

  const capturedAt = parsed.data ?? today();
  const report = await runIngest(db, { capturedAt });

  console.log(`Ingest for ${report.capturedAt}`);
  console.log(`  approved submissions : ${report.considered}`);
  console.log(`  metrics written      : ${report.inserted}`);
  console.log(`  already captured     : ${report.skipped}`);
  console.log(`  budget allocated     : ${(report.grantedCents / 100).toFixed(2)}`);

  if (report.failures.length > 0) {
    console.error(`  failed               : ${report.failures.length}`);
    for (const failure of report.failures) {
      console.error(`    - ${failure.submissionId}: ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
