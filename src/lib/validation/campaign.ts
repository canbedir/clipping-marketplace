import { z } from "zod";

import { CAMPAIGN_STATUSES, PLATFORMS } from "@/lib/constants";
import { parseMoneyToCents } from "@/lib/money";

const moneyCents = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50" });
      return z.NEVER;
    }
    return cents;
  })
  .refine((cents) => cents > 0, { message: "Must be greater than zero" });

export const campaignFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, { message: "Give the campaign a title of at least 3 characters" })
      .max(120, { message: "Keep the title under 120 characters" }),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, { message: "Pick at least one platform" })
      .transform((values) => [...new Set(values)]),
    payoutPer1kViews: moneyCents,
    totalBudget: moneyCents,
    status: z.enum(CAMPAIGN_STATUSES),
    startsAt: z.iso.date({ message: "Pick a start date" }),
    endsAt: z.iso.date({ message: "Pick an end date" }),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    path: ["endsAt"],
    message: "The end date must be on or after the start date",
  });

export type CampaignFormValues = z.input<typeof campaignFormSchema>;
export type CampaignFormOutput = z.output<typeof campaignFormSchema>;

export const createCampaignInput = campaignFormSchema;

export const updateCampaignInput = z.object({
  id: z.uuid(),
  data: campaignFormSchema,
});

export const campaignListInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(""),
  status: z.enum(CAMPAIGN_STATUSES).nullable().default(null),
});

export type CampaignListInput = z.input<typeof campaignListInput>;
