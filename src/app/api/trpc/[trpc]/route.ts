import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

// The only route handler in the app: tRPC's transport. No application data is
// served over REST.
function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: ({ resHeaders }) =>
      createTRPCContext({ headers: request.headers, resHeaders }),
  });
}

export { handler as GET, handler as POST };
