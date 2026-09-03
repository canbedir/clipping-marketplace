import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";

import { AppError, isAppError, type AppErrorDetail } from "@/server/errors";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.flattenError(error.cause).fieldErrors : null,
        appError: isAppError(error.cause) ? error.cause.detail : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// tRPC hands a resolver failure back as a result rather than throwing it, so a
// try/catch here would never see a domain error.
const translateAppErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && isAppError(result.error.cause)) {
    throw result.error.cause.toTRPCError();
  }
  return result;
});

export const publicProcedure = t.procedure.use(translateAppErrors);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Pick a user from the switcher first",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Creators only" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export type { AppErrorDetail };
