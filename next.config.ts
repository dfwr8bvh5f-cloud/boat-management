import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel's Serverless Functions platform caps request bodies at ~4.5mb
      // regardless of this setting, so stay under that rather than let a
      // larger upload fail with a worse, platform-level error.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
