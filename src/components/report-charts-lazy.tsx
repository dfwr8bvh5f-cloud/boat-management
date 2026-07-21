"use client";

// recharts is a ~336KB chunk - report/page.tsx is a server component, so
// `dynamic(..., { ssr: false })` can't be called there directly (Next.js
// requires that boundary to live in a client component). These wrappers
// let the report page defer loading recharts until after the rest of the
// page (KPIs, budget table) has painted, matching the same lazy pattern
// reports-manager.tsx already uses for its own CategoryPieChart usage.
import dynamic from "next/dynamic";

const CHART_SKELETON_BAR = <div className="mx-auto h-72 w-full max-w-lg animate-pulse rounded-lg bg-fleet-paper" />;
const CHART_SKELETON_PIE = <div className="mx-auto h-56 w-56 animate-pulse rounded-full bg-fleet-paper" />;

export const ReportBarChart = dynamic(() => import("@/components/report-bar-chart").then((m) => m.ReportBarChart), {
  ssr: false,
  loading: () => CHART_SKELETON_BAR,
});

export const CategoryPieChart = dynamic(() => import("@/components/category-pie-chart").then((m) => m.CategoryPieChart), {
  ssr: false,
  loading: () => CHART_SKELETON_PIE,
});
