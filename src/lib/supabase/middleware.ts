import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_ID_HEADER } from "./auth-header";
import { createAdminClient } from "./admin";
import { DEMO_EMAIL, DEMO_VISIT_COOKIE } from "@/lib/demo";

// "/demo" signs the visitor in itself (see src/app/demo/route.ts) - it must
// stay reachable while logged out, the same reason /login does, or this
// redirect would bounce every anonymous visitor to /login before the route
// ever got to run.
const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/reset-password", "/demo"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Only ever fires for the public demo account (see src/app/demo/route.ts),
// never for a real user - so where someone browsed inside a demo visit can
// be shown back on /settings/demo-visits without adding any tracking to
// everyone else's navigation. Best-effort and awaited (not fire-and-forget
// - middleware can be torn down the instant it returns a response, same
// reasoning as /demo's own push notification).
async function logDemoPageView(request: NextRequest, path: string) {
  const visitId = request.cookies.get(DEMO_VISIT_COOKIE)?.value;
  if (!visitId) return;
  try {
    await createAdminClient().from("demo_page_views").insert({ visit_id: visitId, path });
  } catch (e) {
    console.error("logDemoPageView failed:", e);
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pendingCookies: { name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
            pendingCookies.push({ name, value, options });
          }
        },
      },
    }
  );

  // IMPORTANT: do not remove. This call refreshes the auth token and
  // must run before any other Supabase call in this request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Lets getCurrentProfile() (src/lib/auth.ts) read the verified user id
  // straight off the request instead of calling supabase.auth.getUser()
  // again - that second call was a full network round-trip to Supabase's
  // Auth server on every single page render, doubling the auth cost of
  // every navigation. Safe because this header is set here, unconditionally,
  // from the id this exact call just verified server-side - any value a
  // client tried to send arrives already overwritten by the time anything
  // downstream reads it, since middleware always runs first.
  request.headers.set(VERIFIED_USER_ID_HEADER, user?.id ?? "");
  response = NextResponse.next({ request });
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  const { pathname } = request.nextUrl;
  // GET only - a server action POSTs to the same page URL it's shown on,
  // which would otherwise double-log that page for every button click.
  const isDemoNavigation = user?.email === DEMO_EMAIL && request.method === "GET";

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // "/" always used to redirect() (client-visible 307) to /boats/[id] or
  // /boats once page.tsx figured out the user's role/boat - that redirect
  // forced the browser to make a second full request, which meant this
  // middleware ran a second time and paid for a second auth.getUser()
  // network round trip. Doing the same role/boat lookup here and
  // rewriting (server-side, invisible to the browser) instead collapses
  // that into the single request already in flight.
  if (user && pathname === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, boat_id")
      .eq("id", user.id)
      .single();

    const destination = profile?.role === "management" ? "/boats" : profile?.boat_id ? `/boats/${profile.boat_id}` : null;

    if (destination) {
      if (isDemoNavigation) await logDemoPageView(request, destination);
      const rewritten = NextResponse.rewrite(new URL(destination, request.url), { request });
      for (const { name, value, options } of pendingCookies) {
        rewritten.cookies.set(name, value, options);
      }
      return rewritten;
    }
  }

  if (isDemoNavigation) await logDemoPageView(request, pathname);

  return response;
}
