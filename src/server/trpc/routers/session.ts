import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { serializeSessionCookie } from "@/server/auth/session";
import { users } from "@/server/db/schema";
import { createTRPCRouter, publicProcedure } from "../init";

const publicUser = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
};

export const sessionRouter = createTRPCRouter({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    const { id, name, email, role } = ctx.user;
    return { id, name, email, role };
  }),

  // The assignment asks for a dev-only switcher instead of real auth, so this
  // deliberately trusts whoever calls it. It is the one procedure that would be
  // deleted the day an identity provider goes in.
  available: publicProcedure.query(({ ctx }) =>
    ctx.db.select(publicUser).from(users).orderBy(asc(users.role), asc(users.name)),
  ),

  switchTo: publicProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select(publicUser)
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No such user" });

      ctx.resHeaders?.append("set-cookie", serializeSessionCookie(user.id));
      return user;
    }),

  signOut: publicProcedure.mutation(({ ctx }) => {
    ctx.resHeaders?.append("set-cookie", serializeSessionCookie(null));
    return { ok: true };
  }),
});
