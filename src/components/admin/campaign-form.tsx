"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAMPAIGN_STATUSES,
  PLATFORMS,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/constants";
import { useTRPC } from "@/lib/trpc/client";
import { messageOf } from "@/lib/trpc/errors";
import {
  campaignFormSchema,
  type CampaignFormOutput,
  type CampaignFormValues,
} from "@/lib/validation/campaign";

export function CampaignForm({
  campaignId,
  defaultValues,
}: {
  campaignId?: string;
  defaultValues: CampaignFormValues;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<CampaignFormValues, unknown, CampaignFormOutput>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues,
  });

  const onSettled = async (id: string) => {
    await queryClient.invalidateQueries();
    router.push(`/admin/campaigns/${id}`);
  };

  const create = useMutation(
    trpc.campaign.create.mutationOptions({
      onSuccess: async (campaign) => {
        toast.success("Campaign created");
        await onSettled(campaign.id);
      },
      onError: (error) => toast.error(messageOf(error, "Could not create the campaign")),
    }),
  );

  const update = useMutation(
    trpc.campaign.update.mutationOptions({
      onSuccess: async (campaign) => {
        toast.success("Campaign saved");
        await onSettled(campaign.id);
      },
      onError: (error) => toast.error(messageOf(error, "Could not save the campaign")),
    }),
  );

  const pending = create.isPending || update.isPending;

  // The browser runs the schema for instant feedback, but what goes over the
  // wire is still the raw input: the server parses it again with the same
  // schema and that parse is the one that counts.
  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    if (campaignId) update.mutate({ id: campaignId, data: values });
    else create.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            {...form.register("title")}
            aria-invalid={Boolean(form.formState.errors.title)}
            autoComplete="off"
          />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Platforms</FieldLegend>
          <FieldDescription>
            Creators can only submit clips from the platforms you pick here.
          </FieldDescription>
          <Controller
            control={form.control}
            name="platforms"
            render={({ field }) => (
              <div className="flex flex-wrap gap-4 pt-1">
                {PLATFORMS.map((platform) => {
                  const selected = (field.value ?? []) as Platform[];
                  const checked = selected.includes(platform);
                  return (
                    <FieldLabel
                      key={platform}
                      htmlFor={`platform-${platform}`}
                      className="flex-row items-center gap-2 font-normal"
                    >
                      <Checkbox
                        id={`platform-${platform}`}
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...selected, platform]
                              : selected.filter((value) => value !== platform),
                          )
                        }
                      />
                      {PLATFORM_LABELS[platform]}
                    </FieldLabel>
                  );
                })}
              </div>
            )}
          />
          <FieldError errors={[form.formState.errors.platforms]} />
        </FieldSet>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="payoutPer1kViews">Payout per 1,000 views</FieldLabel>
            <Input
              id="payoutPer1kViews"
              inputMode="decimal"
              placeholder="2.50"
              {...form.register("payoutPer1kViews")}
              aria-invalid={Boolean(form.formState.errors.payoutPer1kViews)}
            />
            <FieldDescription>In euros. Stored to the cent.</FieldDescription>
            <FieldError errors={[form.formState.errors.payoutPer1kViews]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="totalBudget">Total budget</FieldLabel>
            <Input
              id="totalBudget"
              inputMode="decimal"
              placeholder="2500.00"
              {...form.register("totalBudget")}
              aria-invalid={Boolean(form.formState.errors.totalBudget)}
            />
            <FieldDescription>The campaign never pays out more than this.</FieldDescription>
            <FieldError errors={[form.formState.errors.totalBudget]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
            <Input
              id="startsAt"
              type="date"
              {...form.register("startsAt")}
              aria-invalid={Boolean(form.formState.errors.startsAt)}
            />
            <FieldError errors={[form.formState.errors.startsAt]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
            <Input
              id="endsAt"
              type="date"
              {...form.register("endsAt")}
              aria-invalid={Boolean(form.formState.errors.endsAt)}
            />
            <FieldError errors={[form.formState.errors.endsAt]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="capitalize">
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>Only active campaigns accept submissions.</FieldDescription>
          <FieldError errors={[form.formState.errors.status]} />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : campaignId ? "Save changes" : "Create campaign"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
