import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard is served under /ops so it shares an origin with the citizen app in
  // development — that shared origin is what lets the two agree without a server.
  basePath: "/ops",
  typedRoutes: true,
  // The shared core ships TypeScript source, so Next compiles it with the app.
  transpilePackages: ["@swachhata/core"],
};

export default nextConfig;
