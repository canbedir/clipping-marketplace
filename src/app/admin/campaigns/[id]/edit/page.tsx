import Link from "next/link";

import { EditCampaign } from "@/components/admin/edit-campaign";

export const metadata = { title: "Edit campaign" };

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/campaigns/${id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to campaign
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit campaign</h1>
      </div>
      <EditCampaign campaignId={id} />
    </div>
  );
}
