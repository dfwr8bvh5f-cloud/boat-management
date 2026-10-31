"use client";

// Segment-level boundary: a render/refresh failure inside any app screen is
// contained to the content area, so the header and navigation stay on screen
// and "Try again" re-renders just this segment instead of replacing the
// whole document with the root boundary's card.
export { default } from "@/app/error";
