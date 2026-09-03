import { CampaignDetail } from "@/components/admin/campaign-detail";

export const metadata = { title: "Campaign" };

export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignDetail campaignId={id} />;
}
