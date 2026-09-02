import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MYS FLEET",
    short_name: "MYS FLEET",
    description: "Charter yacht fleet management system",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F8F7",
    theme_color: "#0B1F38",
    // Android's home screen applies its own adaptive-icon mask (circle,
    // squircle, etc.) to whichever icon it picks. Without a "maskable" one
    // to use for that, it was masking the plain icon above - which fills
    // almost the entire square with no margin - and clipping the outer
    // ring of the logo away, which on several launchers falls back to a
    // generic placeholder instead of showing the clipped result. The
    // maskable variants are the same logo redrawn with a wide safe margin
    // so any mask shape still leaves the whole logo visible; "any" is left
    // untouched for contexts (browser tab, iOS home screen) that use the
    // icon as-is with no masking.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
