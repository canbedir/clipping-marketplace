import { createCallerFactory, createTRPCRouter } from "./init";
import { campaignRouter } from "./routers/campaign";
import { sessionRouter } from "./routers/session";
import { submissionRouter } from "./routers/submission";

export const appRouter = createTRPCRouter({
  session: sessionRouter,
  campaign: campaignRouter,
  submission: submissionRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
