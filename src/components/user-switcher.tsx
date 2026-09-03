"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";
import { messageOf } from "@/lib/trpc/errors";

export function UserSwitcher() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const me = useQuery(trpc.session.me.queryOptions());
  const available = useQuery(trpc.session.available.queryOptions());

  const switchTo = useMutation(
    trpc.session.switchTo.mutationOptions({
      onSuccess: async (user) => {
        await queryClient.invalidateQueries();
        router.refresh();
        router.push(user.role === "admin" ? "/admin/campaigns" : "/campaigns");
        toast.success(`Signed in as ${user.name}`);
      },
      onError: (error) => toast.error(messageOf(error, "Could not switch user")),
    }),
  );

  if (available.isPending) {
    return <Skeleton className="h-9 w-56" />;
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="user-switcher" className="text-xs text-muted-foreground">
        Viewing as
      </Label>
      <Select
        value={me.data?.id ?? ""}
        onValueChange={(userId) => switchTo.mutate({ userId })}
        disabled={switchTo.isPending}
      >
        <SelectTrigger id="user-switcher" className="w-56" size="sm">
          <SelectValue placeholder="Pick a user" />
        </SelectTrigger>
        <SelectContent>
          {(["admin", "creator"] as const).map((role) => {
            const users = (available.data ?? []).filter((user) => user.role === role);
            if (users.length === 0) return null;
            return (
              <SelectGroup key={role}>
                <SelectLabel className="capitalize">{role}s</SelectLabel>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
