import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // The shared core ships TypeScript source, so Next compiles it with the app.
  transpilePackages: ["@swachhata/core"],

  /**
   * Development only: proxy the operations dashboard so both interfaces answer on one
   * origin. Same origin means one localStorage and one BroadcastChannel, which is how an
   * absence marked by staff reaches a resident's screen before the backend exists.
   * In production each app is deployed separately and talks to Supabase instead.
   */
  async rewrites() {
    // Development only. In production each app is deployed separately, and proxying to a
    // localhost port would just be a broken route.
    if (process.env.NODE_ENV === "production" && !process.env.ADMIN_ORIGIN) return [];

    const adminOrigin = process.env.ADMIN_ORIGIN ?? "http://localhost:3001";
    return [
      { source: "/ops", destination: `${adminOrigin}/ops` },
      { source: "/ops/:path*", destination: `${adminOrigin}/ops/:path*` },
    ];
  },
};

export default nextConfig;
