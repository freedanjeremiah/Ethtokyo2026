import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@enf/verifier"],
  // Hide the dev-mode badge so it doesn't show up on the projected demo.
  devIndicators: false,
  // deployment.server.ts reads ../deployments/sepolia.json, ../deployments/abis/*.json and the
  // gitignored fleet.*.json with node:fs at request time (REPO_ROOT from import.meta.url), not
  // via static import — so Next's file tracer doesn't see them and won't bundle them for
  // `next start`/Vercel unless told to explicitly.
  outputFileTracingIncludes: {
    "/api/verify": ["../deployments/**"],
    "/api/fleet": ["../deployments/**"],
  },
};

export default nextConfig;
