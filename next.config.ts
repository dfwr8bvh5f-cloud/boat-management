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
  images: {
    // Boat photos/logos are served from Supabase Storage signed URLs -
    // needed for next/image to be allowed to fetch and optimize them.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" }],
  },
};

export default nextConfig;
