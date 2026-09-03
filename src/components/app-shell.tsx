"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { UserSwitcher } from "@/components/user-switcher";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const NAV = {
  admin: [{ href: "/admin/campaigns", label: "Campaigns" }],
  creator: [
    { href: "/campaigns", label: "Browse campaigns" },
    { href: "/submissions", label: "My submissions" },
  ],
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const pathname = usePathname();
  const me = useQuery(trpc.session.me.queryOptions());

  const links = me.data ? NAV[me.data.role] : [];

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Clipping Marketplace
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <UserSwitcher />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
