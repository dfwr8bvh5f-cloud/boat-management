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
    // needed for next/image to be allowed to render them.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" }],
    // Signed URLs carry a fresh one-time token on every request, so
    // Vercel's Image Optimization API can never get a cache hit on them -
    // every page load counted as a brand-new "source image" against the
    // account's monthly optimization quota, which is what tripped the
    // 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED errors. Images are
    // already compressed client-side before upload, so there's nothing to
    // gain from server-side resizing here - serve them as-is instead.
    unoptimized: true,
  },
};

export default nextConfig;
