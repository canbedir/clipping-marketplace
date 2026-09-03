"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { inferRouterOutputs } from "@trpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_LABELS, PLATFORM_URL_HINTS } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { remainingBudget } from "@/lib/payout";
import { useTRPC } from "@/lib/trpc/client";
import { appErrorOf, messageOf } from "@/lib/trpc/errors";
import { submissionFormSchema } from "@/lib/validation/submission";
import type { AppRouter } from "@/server/trpc/root";

export function SubmitClip({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.campaign.openById.queryOptions({ id: campaignId }));

  if (query.isPending) {
    return (
      <div className="max-w-2xl space-y-4" aria-hidden>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="max-w-2xl space-y-4">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        <Button asChild variant="outline">
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  return <SubmitForm campaign={query.data} />;
}

type OpenCampaign = inferRouterOutputs<AppRouter>["campaign"]["openById"];

function SubmitForm({ campaign }: { campaign: OpenCampaign }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const schema = submissionFormSchema(campaign.platforms);
  const form = useForm<{ postUrl: string }>({
    resolver: zodResolver(schema),
    defaultValues: { postUrl: "" },
  });

  const create = useMutation(
    trpc.submission.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        toast.success("Clip submitted", {
          description: "An admin will review it and you will see the outcome on this page.",
        });
        router.push("/submissions");
      },
      onError: (error) => {
        const detail = appErrorOf(error);
        if (detail?.code === "DUPLICATE_SUBMISSION") {
          form.setError("postUrl", {
            message: "You have already submitted this post to this campaign",
          });
          return;
        }
        if (detail?.code === "CAMPAIGN_NOT_ACCEPTING") {
          toast.error("This campaign is no longer accepting clips");
          return;
        }
        form.setError("postUrl", { message: messageOf(error, "Could not submit that clip") });
      },
    }),
  );

  const left = remainingBudget(campaign.totalBudget, campaign.spent);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to campaigns
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <p className="text-sm text-muted-foreground">
          {campaign.platforms.map((p) => PLATFORM_LABELS[p]).join(" / ")}
          {" · "}
          {formatCents(campaign.payoutPer1kViews)} per 1,000 views
          {" · "}
          {formatCents(left)} of budget left
          {" · "}
          runs {campaign.startsAt} to {campaign.endsAt}
        </p>
      </div>

      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          create.mutate({ campaignId: campaign.id, postUrl: values.postUrl }),
        )}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="postUrl">Post URL</FieldLabel>
          <Input
            id="postUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder={PLATFORM_URL_HINTS[campaign.platforms[0]!]}
            aria-invalid={Boolean(form.formState.errors.postUrl)}
            aria-describedby="postUrl-hint"
            {...form.register("postUrl")}
          />
          <FieldDescription id="postUrl-hint">
            The link to your published clip. This campaign accepts{" "}
            {campaign.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}. The same post can
            only be submitted once per campaign.
          </FieldDescription>
          <FieldError errors={[form.formState.errors.postUrl]} />
        </Field>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Submitting…" : "Submit clip"}
        </Button>
      </form>
    </div>
  );
}
