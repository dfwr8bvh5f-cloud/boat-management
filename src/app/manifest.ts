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
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
