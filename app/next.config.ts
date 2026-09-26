import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mount/verifier"],
  // deployment.server.ts reads ../deployments/sepolia.json, ../deployments/abis/*.json and the
  // gitignored fleet.*.json with node:fs at request time (REPO_ROOT from import.meta.url), not
  // via static import — so Next's file tracer doesn't see them and won't bundle them for
  // `next start`/Vercel unless told to explicitly.
  outputFileTracingIncludes: {
    "/api/verify": ["../deployments/**"],
  },
};

export default nextConfig;
