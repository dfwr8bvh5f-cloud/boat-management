// Shared between middleware.ts (writer) and lib/auth.ts (reader) - see the
// comment in middleware.ts for why this exists. Kept in its own tiny file
// so importing the constant doesn't pull anything edge-runtime-specific
// into auth.ts, or anything Node-specific into middleware.ts.
export const VERIFIED_USER_ID_HEADER = "x-mys-verified-user-id";
