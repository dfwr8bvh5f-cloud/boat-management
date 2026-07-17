import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A leading underscore is this codebase's convention for "kept for a
      // consistent call signature across siblings, deliberately unused" -
      // e.g. assertCanEditBoat(_boatId) matching assertCanUploadPhotos(boatId).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // e2e/ contains Playwright test code, not React - Playwright's own
    // fixture API uses a parameter literally named `use`, which the
    // react-hooks lint rule otherwise mistakes for the React hook of the
    // same name.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
