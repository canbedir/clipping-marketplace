import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That link does not point at anything on this platform.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go back</Link>
      </Button>
    </div>
  );
}
