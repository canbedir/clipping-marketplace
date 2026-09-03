CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('tiktok', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"platforms" "platform"[] NOT NULL,
	"payout_per_1k_views" integer NOT NULL,
	"total_budget" integer NOT NULL,
	"spent" integer DEFAULT 0 NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_payout_positive" CHECK ("campaigns"."payout_per_1k_views" > 0),
	CONSTRAINT "campaigns_budget_positive" CHECK ("campaigns"."total_budget" > 0),
	CONSTRAINT "campaigns_period_ordered" CHECK ("campaigns"."ends_at" >= "campaigns"."starts_at"),
	CONSTRAINT "campaigns_platforms_not_empty" CHECK (array_length("campaigns"."platforms", 1) >= 1),
	CONSTRAINT "campaigns_spent_within_budget" CHECK ("campaigns"."spent" >= 0 AND "campaigns"."spent" <= "campaigns"."total_budget")
);
--> statement-breakpoint
CREATE TABLE "submission_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"views" integer NOT NULL,
	"likes" integer NOT NULL,
	"comments" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_metrics_counts_non_negative" CHECK ("submission_metrics"."views" >= 0 AND "submission_metrics"."likes" >= 0 AND "submission_metrics"."comments" >= 0)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"payable" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_rejection_reason_required" CHECK ("submissions"."status" <> 'rejected' OR "submissions"."rejection_reason" IS NOT NULL),
	CONSTRAINT "submissions_payable_only_when_earning" CHECK ("submissions"."payable" >= 0 AND ("submissions"."status" IN ('approved', 'paid') OR "submissions"."payable" = 0))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "submission_metrics" ADD CONSTRAINT "submission_metrics_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_status_created_at_idx" ON "campaigns" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "submission_metrics_submission_captured_at_key" ON "submission_metrics" USING btree ("submission_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_campaign_canonical_url_key" ON "submissions" USING btree ("campaign_id","canonical_url");--> statement-breakpoint
CREATE INDEX "submissions_campaign_status_created_at_idx" ON "submissions" USING btree ("campaign_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_creator_created_at_idx" ON "submissions" USING btree ("creator_id","created_at" DESC NULLS LAST);