"use client";

import { useState } from "react";

const DEFAULT_PAGE_SIZE = 50;

// Render-only pagination for a list whose full array is already fetched
// server-side (needed for accurate totals/filters/CSV export) but is too
// long to put in the DOM all at once - shows the first N items and grows on
// "load more" instead of rendering everything up front. Resets back to the
// first page whenever the underlying list identity changes (a new filter,
// a new search term, a different boat) so a stale "load more" position
// doesn't hide items a user just filtered for.
//
// Resets during render (React's documented "adjusting state when a prop
// changes" pattern - see react.dev/learn/you-might-not-need-an-effect)
// rather than in a useEffect, so the reset is visible in the very first
// render after `items` changes instead of flashing the old page first.
export function usePagedList<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [prevItems, setPrevItems] = useState(items);
  const [prevPageSize, setPrevPageSize] = useState(pageSize);

  if (items !== prevItems) {
    setPrevItems(items);
    setPrevPageSize(pageSize);
    setVisibleCount(pageSize);
  } else if (pageSize !== prevPageSize) {
    // Same list, but the caller wants a different minimum reveal (e.g.
    // bookings-manager widening the page to keep a calendar-highlighted
    // booking visible) - grow to cover it without losing "load more"
    // progress the user already made elsewhere in the list.
    setPrevPageSize(pageSize);
    setVisibleCount((c) => Math.max(c, pageSize));
  }

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const loadMore = () => setVisibleCount((c) => c + pageSize);

  return { visibleItems, hasMore, loadMore, remaining: items.length - visibleCount };
}
