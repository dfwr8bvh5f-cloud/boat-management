"use client";

import { createContext, useContext } from "react";

// A Server Component can't hand a Client Component a plain function prop
// (only serializable data crosses that boundary) - so "close the panel after
// a successful save" can't be wired via a callback prop passed down from
// boats/[id]/page.tsx. This context lets BoatSpecsCard (a Client Component)
// publish its own close() function for any client descendant - like
// AutoSaveForm - to pick up, entirely on the client side.
const CloseSpecsEditContext = createContext<(() => void) | null>(null);

export const CloseSpecsEditProvider = CloseSpecsEditContext.Provider;

export function useCloseSpecsEdit() {
  return useContext(CloseSpecsEditContext);
}
