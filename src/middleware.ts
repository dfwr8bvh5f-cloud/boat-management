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
    //
    // sw.js is the same kind of public asset (approved by the project owner):
    // the browser fetches a service worker script by itself, for registration
    // and every update check, and behind the login redirect that request
    // ended in a 307 to /login, which browsers reject ("script resource is
    // behind a redirect"). It's a static file with no data in it.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
