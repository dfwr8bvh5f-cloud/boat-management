import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only target pure, network-free logic (src/lib/**) - anything
// touching Supabase, Next.js server/client boundaries, or React rendering
// belongs in the Playwright e2e suite instead, which can actually exercise
// a running app. Keeping this config minimal (no jsdom, no React plugin) is
// deliberate: it forces tests to stay fast and dependency-free.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
