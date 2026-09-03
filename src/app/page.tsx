import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resolveUserFromHeaders } from "@/server/trpc/context";

export default async function HomePage() {
  const user = await resolveUserFromHeaders(await headers());

  if (user) {
    redirect(user.role === "admin" ? "/admin/campaigns" : "/campaigns");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Clipping Marketplace</h1>
      <p className="text-sm text-muted-foreground">
        Brands run paid clipping campaigns; creators submit short-form clips and are paid per
        thousand views, up to the campaign budget.
      </p>
      <Alert>
        <AlertTitle>Pick a user to continue</AlertTitle>
        <AlertDescription>
          There is no sign-in here on purpose. Use the switcher in the top right to view the app
          as an admin or as a creator.
        </AlertDescription>
      </Alert>
    </div>
  );
}
