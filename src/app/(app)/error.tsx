"use client";

// Nested boundary for everything inside the signed-in app shell: a failed
// server action or page query now replaces only the page content, so the
// header/navigation stay on screen and the user can go elsewhere without a
// full reload. (The root src/app/error.tsx still catches anything that fails
// outside this layout, e.g. the layout itself or the login pages.)
export { default } from "@/app/error";
