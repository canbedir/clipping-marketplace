# Notes

A cut-down clipping marketplace: brands run paid campaigns, creators submit clips, and
approved clips earn `floor(views / 1000) * payout_per_1k_views` up to the campaign budget.

Live at **https://clipping-marketplace.vercel.app** (Vercel, with Neon Postgres in
Frankfurt). There is no sign-in: pick a user from the switcher in the top right.

Most of the effort went into the money path. The UI is deliberately close to shadcn
defaults.

## Setup

Needs Node 20+, pnpm, and Docker.

```bash
pnpm install
docker compose up -d          # Postgres 17 on localhost:5433
cp .env.example .env
pnpm db:migrate               # applies drizzle/0000_init.sql
pnpm db:seed                  # users, campaigns, submissions, metric history
pnpm dev                      # http://localhost:3000
```

There is no sign-in. Use the switcher in the top right to view the app as an admin
(`admin@wayv.test`, `reviewer@wayv.test`) or as a creator (`mila@creators.test` and three
others). The switcher writes an HMAC-signed cookie holding a user id; every procedure
resolves the user from that cookie and never from anything in the request payload.

```bash
pnpm test                     # 52 tests against a real Postgres
pnpm ingest                   # fake a daily metrics sync; safe to run twice
pnpm ingest 2026-09-01        # or backfill a specific day
```

Every script reads `.env` by default and can be pointed elsewhere without editing it,
which is how the deployed database gets migrated:

```bash
ENV_FILE=.env.deploy pnpm db:migrate
```

Worth naming the file something Next does not recognise. `next build` and `next start`
load `.env.production.local` ahead of `.env` on their own, so keeping a deployment
connection string under that name silently points a local production server at the remote
database — which cost me an afternoon of confusing test results before I spotted it.

`pnpm test` uses a second database (`clipping_marketplace_test`) created by
`docker/init-test-db.sql` in the same container, configured through the committed
`.env.test`. It migrates itself on first run, so a clean checkout only needs the steps
above. Tests truncate between cases, which is why they run one file at a time.

## The data model, and the two columns that are not in the brief

Beyond `campaign`, `submission`, `submission_metric` and `user`, there are two extra
columns, both about money:

- `campaigns.spent` — what the campaign has committed, in cents.
- `submissions.payable` — what a single submission has actually earned, in cents.

Views are derived: the latest `submission_metric` row is the truth and nothing caches it.
Money is materialised, because it is the thing that has to stay transactionally consistent
and cheap to read on a list of a thousand rows.

The invariants live in the schema rather than only in the service layer:

| Constraint | What it prevents |
| --- | --- |
| `CHECK (spent >= 0 AND spent <= total_budget)` | any code path overspending a campaign |
| `CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)` | a rejection with no reason |
| `CHECK (status IN ('approved','paid') OR payable = 0)` | paying for work that was not approved |
| `UNIQUE (campaign_id, canonical_url)` | the same clip landing twice on one campaign |
| `UNIQUE (submission_id, captured_at)` | a second ingest run duplicating a day |

The last two are the reason there is no check-then-insert anywhere: the duplicate cases
are caught by the unique violation and translated into typed errors.

URLs are canonicalised before they are stored, so `youtu.be/X`, `youtube.com/watch?v=X&t=42`
and `m.youtube.com/shorts/X` all collapse to one key, as do Instagram's `/p/` and `/reel/`
forms. Deduplicating on the raw string would have let a tracking parameter through.

Campaign periods and capture dates are `date`, not `timestamp`. The domain is day-granular
and this keeps time zones out of the payout math entirely.

## Concurrent approvals

**What ships.** `approveSubmission` opens a transaction, takes
`SELECT ... FROM campaigns WHERE id = $1 FOR UPDATE`, and only then reads the latest metric,
computes the payout and compares it against `total_budget - spent`. Two admins approving at
the same moment are serialised by Postgres: the second transaction blocks on the lock, and
when it resumes it re-reads a `spent` that already includes the first approval. It then
fails with a typed `BUDGET_EXCEEDED` carrying `remaining` and `required`, which is enough
for the UI to say what happened without another round trip.

Both rows are locked in a fixed order — campaign first, then submission — so two approvals
on different submissions of the same campaign cannot deadlock each other.

`tests/concurrency.test.ts` has an eight-way race against a budget that covers exactly
three approvals, and asserts that exactly three get through and `spent` lands on the budget
to the cent.

**What I ruled out.**

- *No lock at all.* This is the lost update, and the test suite contains a deliberately
  unlocked approval that demonstrates it: both transactions read `spent = 0`, both write
  `spent = 500`, one write is lost, and the campaign ends up owing 1000 while reporting 500.
  The `CHECK` constraint does not catch this — the number it sees is legal, just wrong.
  That test is there because it is the thing the lock is for.
- `SERIALIZABLE` *isolation.* It would also be correct, but it turns a lock wait into a
  serialisation failure that every caller has to retry, and approvals on the same campaign
  are exactly the workload that would abort most. `FOR UPDATE` blocks briefly instead, and
  contention here is per campaign, not global.
- *An optimistic version column with a compare-and-swap retry.* Fine when writes rarely
  collide, but it pushes a retry loop into every call site and gives a worse failure story:
  a creator would see "please try again" where the honest answer is "the budget is gone".
- *A database constraint alone.* `CHECK (spent <= total_budget)` cannot express "and the
  approval that would have breached it should fail with a message the UI can act on". It is
  the backstop, not the mechanism — it turns a logic bug into a failed transaction rather
  than a silent overspend.

## The ceiling is not only an approval-time problem

Views keep growing after a clip is approved, so a check that only runs at approval time
would let a single popular clip walk a campaign past its budget a week later.

So `payable` is allocated, not just calculated. On approval a submission is granted its
current earnings. On every ingest, the run recomputes what the submission has now earned and
grants `min(newEarnings - payable, remaining)` under the same campaign lock. Late view
growth is capped at whatever budget is left, first-come first-served by approval order, and
the campaign flips to `completed` in the same transaction that exhausts it.

The consequence is deliberate and worth naming: a clip can keep gaining views after its
campaign is exhausted and earn nothing further. That is what "a campaign never pays out more
than `total_budget`" means in practice.

**This ordering is my decision, not the brief's.** The brief says approvals are first come,
first served, and that is about the race: of two admins approving at the same moment, one
wins. It says nothing about who gets the money as views grow afterwards. I extended the same
principle to allocation, so an earlier approval keeps what it has been granted and later
growth takes only what is left. The alternative worth discussing is a per-submission cap —
no clip may take more than some share of the budget — which is what production clipping
platforms tend to do, because under pure approval-order one early clip can absorb a campaign
and starve everyone approved after it. Pro-rata splitting is the third option and I would
avoid it: it means a creator's payout can go down after they have already seen it.

`campaigns.spent` is a materialised sum, and the CHECK constraint only guards its range, not
its agreement with the rows it summarises. `tests/invariants.test.ts` closes that gap: it
drives approvals, rejections, repeated ingests and an eight-way race, then asserts for every
campaign that `spent` equals `SUM(payable)`, that it never passes the budget, and that a
campaign is completed exactly when nothing is left.

Editing a campaign takes the same lock, because the budget is a moving ceiling. Lowering it
below what the campaign has already committed fails with a typed `BUDGET_BELOW_COMMITTED`
that the form renders on the budget field, rather than letting the CHECK constraint surface
as a 500. Raising it works, and setting it to exactly what has been committed completes the
campaign, by the same rule approval and ingest use.

One ordering decision came out of the tests. When a campaign auto-completes because the
money ran out, a later approval could honestly fail with either "campaign is not accepting"
or "budget exceeded". The budget check runs first, because that is the one that tells the
reviewer something they can act on.

## Ingest

`pnpm ingest` walks approved submissions and gives each one its own transaction, so a
failure is isolated: the rest of the run finishes and the failures are listed at the end
with a non-zero exit code.

Idempotency is enforced twice over. The unique index on `(submission_id, captured_at)` with
`ON CONFLICT DO NOTHING` makes a second run for the same day a no-op, and budget is only
granted when a row was actually inserted. On top of that the fake upstream is seeded from
the submission id and the date, so re-running after a partial failure produces the same
numbers rather than a new random walk — which is what a real idempotent third-party sync
would give you.

Views can only go up, and that is enforced in the service (`max(sample, previous)`) rather
than trusted from the sampler, because the sampler is the part that would be replaced by a
real API.

## Assumptions I made rather than asking

- **Pending submissions have view counts.** The brief has ingest write metrics for approved
  submissions only, which would leave a fresh submission at zero views and make the
  approval-time budget check vacuous. In production a clip's stats are known when you review
  it, so the seed gives pending submissions metric history and the review queue shows real
  numbers. `pnpm ingest` still follows the brief exactly and only touches approved rows.
- **Only `active` campaigns accept submissions and approvals.** Draft and paused campaigns
  reject both with a typed `CAMPAIGN_NOT_ACCEPTING`.
- **The daily views chart plots the total views recorded on each day** across the campaign
  period, with `generate_series` filling days nobody captured. Those days read as zero. A
  gap in the middle of the curve is real information — it means no sync ran.
- **`paid` is in the status enum but nothing sets it.** There is no payout run in scope, so
  adding a transition would have been inventing a feature.
- **Money is entered in euros and stored in cents.** The shared schema parses the string to
  integer cents itself instead of multiplying a float by 100.

## Deployment

Vercel, with the database from Vercel's Neon integration. Production uses Neon's pooled
connection string: pgbouncer in transaction mode keeps `BEGIN ... COMMIT` on one backend
connection, so `SELECT ... FOR UPDATE` behaves exactly as it does locally. Migrations were
applied from a workstation with `ENV_FILE=.env.deploy pnpm db:migrate`, and the
same seed script populated it, so the deployed data exercises the same edge cases as the
local one — including a campaign that ran out of budget and closed itself.

## Accessibility

Audited with axe-core against a production build, across the signed-out home page, the
campaign list, the campaign overview, the create form both empty and in its error state,
the reject dialog while open, and both creator screens. It reports no violations at
WCAG 2.1 AA.

Two came out of that audit rather than review, and both were contrast:

- The `draft` and `completed` badges used the muted token pair, which measures 4.34:1
  against its own background — under the 4.5:1 threshold. They now use a darker neutral.
- The preset renders destructive buttons as coloured text on a 10% tint of the same
  colour, which put the reject button at 3.82:1. Darkening `--destructive` in light mode
  fixes the tinted button and the solid uses together.

Keyboard behaviour I checked by driving it rather than by reading the code: the skip link
is the first tab stop and becomes visible when focused, the reject dialog opens on Enter,
moves focus into the textarea, holds focus across repeated tabs and closes on Escape, and
its validation error is announced through `role="alert"`.

That is where the third fix came from. The dialog is opened from state rather than from a
`DialogTrigger`, so Radix had nothing to hand focus back to and it fell to the document
body — every rejection sent a keyboard user back to the top of the page. Closing now
returns focus to the button that opened the dialog, falling back to the review queue
heading if that row has since been refetched away.

The audit is not wired into `pnpm test`, because that would put a browser download in the
way of a clean checkout for a check that needs a running server.

## Left out on purpose

- Real auth. The switcher is one procedure that would be deleted the day an identity
  provider goes in; everything else already reads the user from the session.
- Any custom design work. shadcn defaults, one accent colour, no dark mode toggle.
- RSC prefetching with `HydrationBoundary`. Lists are client-side queries with skeletons,
  which is what makes the loading and error states visible; prefetching would be the next
  step, not a different architecture.
- Cursor pagination. Offset pagination with a `count(*) over ()` window is one round trip
  per page and correct for these page sizes.
- A trigram index on `campaigns.title`. `ILIKE '%term%'` cannot use a B-tree, so at a few
  hundred thousand campaigns this becomes a sequential scan. The fix is `pg_trgm` and a GIN
  index; at the current size it would be unmeasurable.
- Rate limiting, audit logging, soft deletes, email.

## First thing I would fix with another day

**A ledger.** Right now money moves by updating `campaigns.spent` in place, so there is no
record of which approval or which ingest moved it. I would make budget movements
append-only — `(campaign_id, submission_id, delta, reason, created_at)` — and treat `spent`
as a projection of that table rather than the source of truth. It buys three things this
design cannot give: an audit trail for a creator asking why they earned €600 and were paid
€200, a way to reverse an approval an admin made by mistake, and a debuggable history when
the numbers look wrong. For a money system that is the gap that matters most, and it is the
shape real billing systems take.

Second, approval and ingest are two code paths reaching the same conclusion about one
submission. I would collapse them into a single `settleSubmission(tx, submissionId)` that is
the only function allowed to move `payable` and `spent`. Fewer places to get the clamp
wrong, and the concurrency tests would then cover one function instead of two.

Third, the campaign row is a single lock for everything financial, which is right at this
size and wrong at Wayv's. A daily ingest over a campaign with thousands of creators takes
that lock once per submission, serially, and blocks approvals while it runs. The fix is to
batch ingest per campaign — compute outside the lock, apply the deltas inside one — which
trades away the per-submission failure isolation the brief asks for, so it is a decision to
make with real numbers rather than in advance.

## Where AI tooling came in

I used Claude Code throughout, and reviewed everything it produced. The parts worth
reporting are the corrections, since that is the interesting half:

- **The tRPC error middleware was wrong and the tests caught it.** The first version wrapped
  `next()` in a `try/catch` to translate domain errors into `TRPCError`s. tRPC hands a
  resolver failure back as a result object rather than throwing it, so the catch never ran
  and every domain error surfaced as `INTERNAL_SERVER_ERROR`. It looked correct in review;
  the access-control tests are what exposed it. It now inspects `result.ok`.
- **The budget/status check order.** The generated approval checked campaign status before
  the budget, which meant a campaign that had just auto-completed reported "not accepting"
  instead of "budget exceeded" — technically true, useless to the reviewer. The eight-way
  race test is what surfaced it.
- **The form initially sent transformed values to the server.** With a Zod schema that
  parses euros into cents, `handleSubmit` gives you the transformed output, so the client was
  doing the authoritative parse and the server was re-parsing numbers as if they were input.
  The form now submits the raw strings and the server's parse is the one that counts.
- **Locking order.** The first draft locked the submission before the campaign, which is a
  deadlock between two approvals on one campaign. Fixed to campaign first, consistently.
- **Money parsing.** The suggested `Math.round(parseFloat(value) * 100)` is the standard way
  to lose a cent. Replaced with string parsing, and `tests/payout.test.ts` pins the cases
  that break the float version.

The schema, the locking strategy and the choice of what to test were mine. The pieces I
leaned on it hardest for were the shadcn wiring and the SQL for the `generate_series` chart,
both of which I checked against the query plan and the rendered output rather than trusting
them.
