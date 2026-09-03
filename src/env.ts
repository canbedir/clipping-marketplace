import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SESSION_SECRET: z.string().min(8),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = z.flattenError(parsed.error).fieldErrors;
  throw new Error(
    `Invalid environment variables:\n${Object.entries(issues)
      .map(([key, messages]) => `  ${key}: ${messages?.join(", ")}`)
      .join("\n")}\n\nCopy .env.example to .env and fill it in.`,
  );
}

export const env = parsed.data;
