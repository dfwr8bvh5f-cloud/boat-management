import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_ID_HEADER } from "./auth-header";

const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
