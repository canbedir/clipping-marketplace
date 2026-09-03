import { SubmitClip } from "@/components/creator/submit-clip";

export const metadata = { title: "Submit a clip" };

export default async function CreatorCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubmitClip campaignId={id} />;
}
