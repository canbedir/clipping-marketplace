import "dotenv/config";

import { addDays, format, subDays } from "date-fns";
import { sql } from "drizzle-orm";

import type { Platform } from "@/lib/constants";
import { db, pool } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import { approveSubmission, rejectSubmission } from "@/server/services/review";

let seed = 42;
function random(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");

const POST_URLS: Record<Platform, (n: number) => string> = {
  tiktok: (n) => `https://www.tiktok.com/@clipper${n % 7}/video/${7_300_000_000_000_000_000n + BigInt(n)}`,
  instagram: (n) => `https://www.instagram.com/reel/${`Cq${n.toString(36).padStart(9, "x")}`}/`,
  youtube: (n) => `https://www.youtube.com/watch?v=${`vid${n.toString(36).padStart(8, "z")}`}`,
};

const CAMPAIGN_SEEDS = [
  { title: "Sony Music — Summer Single Push", platforms: ["tiktok", "instagram"], rate: 320, budget: 250_000, status: "active" },
  { title: "Warner — Album Teaser Clips", platforms: ["tiktok"], rate: 250, budget: 180_000, status: "active" },
  { title: "Samsung Galaxy — Unboxing Cutdowns", platforms: ["youtube", "instagram"], rate: 480, budget: 400_000, status: "active" },
  { title: "L'Oréal — Get Ready With Me", platforms: ["instagram", "tiktok"], rate: 400, budget: 6_000, status: "active" },
  { title: "Universal — Back Catalogue Revival", platforms: ["tiktok", "youtube"], rate: 210, budget: 120_000, status: "active" },
  { title: "YouTube Shorts — Creator Spotlight", platforms: ["youtube"], rate: 550, budget: 300_000, status: "active" },
  { title: "TikTok Benelux — Festival Recaps", platforms: ["tiktok"], rate: 300, budget: 90_000, status: "paused" },
  { title: "Sony Music — Winter Campaign", platforms: ["tiktok", "instagram", "youtube"], rate: 350, budget: 500_000, status: "draft" },
  { title: "Warner — Vinyl Reissue Teasers", platforms: ["instagram"], rate: 275, budget: 60_000, status: "draft" },
  { title: "Samsung — Foldable Flip Trend", platforms: ["tiktok"], rate: 425, budget: 220_000, status: "active" },
  { title: "L'Oréal — Skincare Routine Clips", platforms: ["instagram"], rate: 380, budget: 140_000, status: "paused" },
  { title: "Universal — Soundtrack Sync Push", platforms: ["youtube", "tiktok"], rate: 460, budget: 260_000, status: "active" },
  { title: "TikTok — Local Artist Discovery", platforms: ["tiktok"], rate: 230, budget: 75_000, status: "active" },
  { title: "Sony Music — Live Session Cuts", platforms: ["youtube"], rate: 500, budget: 310_000, status: "active" },
] as const;

async function main() {
  await db.execute(
    sql`TRUNCATE TABLE submission_metrics, submissions, campaigns, users RESTART IDENTITY CASCADE`,
  );

  const adminRows = await db
    .insert(users)
    .values([
      { email: "admin@wayv.test", name: "Noa de Vries", role: "admin" },
      { email: "reviewer@wayv.test", name: "Sam Bakker", role: "admin" },
    ])
    .returning();

  const creatorRows = await db
    .insert(users)
    .values([
      { email: "mila@creators.test", name: "Mila Jansen", role: "creator" },
      { email: "deniz@creators.test", name: "Deniz Yılmaz", role: "creator" },
      { email: "tom@creators.test", name: "Tom Visser", role: "creator" },
      { email: "aya@creators.test", name: "Aya Nakamura", role: "creator" },
    ])
    .returning();

  const campaignRows = await db
    .insert(campaigns)
    .values(
      CAMPAIGN_SEEDS.map((c, index) => ({
        title: c.title,
        platforms: [...c.platforms],
        payoutPer1kViews: c.rate,
        totalBudget: c.budget,
        status: c.status,
        startsAt: day(-30 + index),
        endsAt: day(30 + index),
        createdAt: subDays(new Date(), CAMPAIGN_SEEDS.length - index),
      })),
    )
    .returning();

  let counter = 0;
  const pendingIds: string[] = [];

  for (const campaign of campaignRows) {
    if (campaign.status === "draft") continue;

    const howMany = 3 + Math.floor(random() * 4);
    for (let i = 0; i < howMany; i += 1) {
      counter += 1;
      const platform = pick(campaign.platforms);
      const url = POST_URLS[platform](counter);
      const creator = pick(creatorRows);

      const [submission] = await db
        .insert(submissions)
        .values({
          campaignId: campaign.id,
          creatorId: creator.id,
          postUrl: url,
          canonicalUrl: url,
          platform,
        })
        .returning();

      // A clip's view count is known before review in production, so the review
      // queue and the budget check both have real numbers to work with.
      let views = 400 + Math.floor(random() * 4_000);
      const history: (typeof submissionMetrics.$inferInsert)[] = [];
      for (let offset = 12; offset >= 0; offset -= 1) {
        // Leave holes so the overview chart has to cope with missing days.
        if (random() < 0.3) continue;
        views += Math.floor(views * (0.05 + random() * 0.25));
        history.push({
          submissionId: submission!.id,
          capturedAt: format(subDays(new Date(), offset), "yyyy-MM-dd"),
          views,
          likes: Math.round(views * (0.03 + random() * 0.05)),
          comments: Math.round(views * (0.002 + random() * 0.006)),
        });
      }
      if (history.length > 0) await db.insert(submissionMetrics).values(history);

      pendingIds.push(submission!.id);
    }
  }

  let approved = 0;
  let rejected = 0;
  let refused = 0;

  for (const submissionId of pendingIds) {
    const roll = random();
    if (roll < 0.15) {
      await rejectSubmission(db, submissionId, pick(REJECTIONS));
      rejected += 1;
      continue;
    }
    if (roll > 0.75) continue;

    try {
      await approveSubmission(db, submissionId);
      approved += 1;
    } catch {
      // Expected on the campaign that is deliberately seeded close to its budget.
      refused += 1;
    }
  }

  const ceiling = await seedBudgetCeilingCampaign(creatorRows.map((c) => c.id));

  console.log("Seeded:");
  console.log(`  admins      : ${adminRows.map((u) => u.email).join(", ")}`);
  console.log(`  creators    : ${creatorRows.map((u) => u.email).join(", ")}`);
  console.log(`  campaigns   : ${campaignRows.length}`);
  console.log(`  submissions : ${pendingIds.length}`);
  console.log(`  approved    : ${approved}`);
  console.log(`  rejected    : ${rejected}`);
  console.log(`  left pending: ${pendingIds.length - approved - rejected - refused}`);
  console.log(`  hit ceiling : ${refused}`);
  console.log(
    `  flash boost : ${ceiling.admitted} approved, ${ceiling.refusedByBudget} blocked by budget`,
  );
}


// A deterministic fixture so the two states that are hard to stumble into are
// always on screen: a campaign that closed itself the moment its budget ran out,
// and a pending submission that cannot be approved because nothing is left.
async function seedBudgetCeilingCampaign(creatorIds: string[]) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: "Sony Music — 48h Flash Boost",
      platforms: ["tiktok"],
      payoutPer1kViews: 300,
      totalBudget: 1_200,
      status: "active",
      startsAt: day(-6),
      endsAt: day(2),
    })
    .returning();

  const created: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const url = `https://www.tiktok.com/@flashclipper/video/${7_400_000_000_000_000_001n + BigInt(i)}`;
    const [submission] = await db
      .insert(submissions)
      .values({
        campaignId: campaign!.id,
        creatorId: creatorIds[i % creatorIds.length]!,
        postUrl: url,
        canonicalUrl: url,
        platform: "tiktok",
      })
      .returning();

    await db.insert(submissionMetrics).values(
      [4, 2, 0].map((offset, step) => ({
        submissionId: submission!.id,
        capturedAt: format(subDays(new Date(), offset), "yyyy-MM-dd"),
        views: 900 + step * 550,
        likes: 40 + step * 30,
        comments: 4 + step * 3,
      })),
    );
    created.push(submission!.id);
  }

  let admitted = 0;
  let refusedByBudget = 0;
  for (const id of created) {
    try {
      await approveSubmission(db, id);
      admitted += 1;
    } catch {
      refusedByBudget += 1;
    }
  }

  return { admitted, refusedByBudget };
}

const REJECTIONS = [
  "Clip is shorter than the 10 second minimum",
  "Product is not visible in the first 3 seconds",
  "Audio does not use the campaign track",
  "Caption is missing the required disclosure",
] as const;

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
