import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, SubmissionStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONE: Record<CampaignStatus | SubmissionStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-border bg-muted text-muted-foreground",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  paid: "border-sky-200 bg-sky-50 text-sky-800",
};

export function StatusBadge({ status }: { status: CampaignStatus | SubmissionStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", TONE[status])}>
      {status}
    </Badge>
  );
}
