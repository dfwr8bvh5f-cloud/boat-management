import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // manifest.webmanifest must stay reachable unauthenticated - Android's
    // "Add to Home Screen" fetches it (and the icons it lists) with no
    // session cookie to check its installability/icon, and was getting
    // redirected to /login instead of the actual JSON, so it fell back to
    // a generic placeholder icon. iOS doesn't hit this since it reads its
    // home-screen icon straight from the public apple-touch-icon link
    // instead of the manifest, which is why this only ever showed up on
    // Android.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
