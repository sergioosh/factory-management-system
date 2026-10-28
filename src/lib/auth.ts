import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

// Trust the deployed URLs on Vercel even if BETTER_AUTH_URL wasn't updated.
const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;
const vercelPreview = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

// The app's real production domain — Better Auth rejects sign-in from any
// origin not in this list ("Invalid origin"), so the custom domain has to be
// listed explicitly. It doesn't stop being in effect if BETTER_AUTH_URL is
// ever misconfigured on the host, unlike the Vercel fallbacks above.
const customDomains = ["https://avion.co.ug", "https://www.avion.co.ug"];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || vercelProd || customDomains[0],
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    vercelProd,
    vercelPreview,
    ...customDomains,
  ].filter((v): v is string => !!v),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      roleId: { type: "number", required: false, input: false },
      active: { type: "boolean", required: false, input: false },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
