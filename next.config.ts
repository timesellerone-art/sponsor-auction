import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const supabasePublicEnv: Record<string, string> = {};
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  supabasePublicEnv.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  supabasePublicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  supabasePublicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

const nextConfig: NextConfig = {
  env: supabasePublicEnv,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  widenClientFileUpload: false,
});
