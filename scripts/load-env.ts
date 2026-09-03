import { config } from "dotenv";

// Defaults to .env, but any script can be pointed at another environment:
//   ENV_FILE=.env.production.local pnpm db:migrate
config({ path: process.env.ENV_FILE ?? ".env", override: true, quiet: true });
