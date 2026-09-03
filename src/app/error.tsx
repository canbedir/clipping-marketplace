"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">Something broke</h1>
      <p className="text-sm text-muted-foreground">
        The page failed to render. Trying again is usually enough.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
