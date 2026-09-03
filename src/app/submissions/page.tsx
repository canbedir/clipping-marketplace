import { MySubmissions } from "@/components/creator/my-submissions";

export const metadata = { title: "My submissions" };

export default function MySubmissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My submissions</h1>
        <p className="text-sm text-muted-foreground">
          Earnings are confirmed once an admin approves a clip. Until then the figure is an
          estimate from the latest view count.
        </p>
      </div>
      <MySubmissions />
    </div>
  );
}
