import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToEmails, LOGIN_NOTIFY_EMAILS } from "@/lib/push";
import { translate } from "@/lib/i18n/translate";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_VISIT_COOKIE } from "@/lib/demo";

export const dynamic = "force-dynamic";

// A single public link anyone can open to land inside the app already
// signed in as the read-only demo account (role "owner", scoped to the
// JULIANA sample boat - see the Settings conversation that created it;
// "owner" has no insert/update/delete access anywhere in the RLS policies,
// so nothing a visitor does here can touch real data) - no email/password
// ever shown or typed. The credentials are known only server-side; the env
// vars let them be rotated without a code change, but fall back to the
// account actually created so this works without extra setup.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

  if (error) {
    console.error("/demo sign-in failed:", error.message);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Best-effort (a failure here must never block the actual sign-in/
  // redirect) but still awaited - a serverless function can be frozen the
  // instant it returns a response, so an unawaited "fire and forget" call
  // here would often never actually get to send before the function dies.
  try {
    await sendPushToEmails(LOGIN_NOTIFY_EMAILS, (locale) => ({
      title: translate(locale, "push_demo_login_title"),
      body: translate(locale, "push_demo_login_body"),
      url: "/settings",
    }));
  } catch (e) {
    console.error("/demo login push failed:", e);
  }

  // A fresh id per sign-in, not per browser - re-opening the link later
  // (even in the same browser) should read as a new visit on the
  // /settings/demo-visits summary, not get silently folded into an old one.
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(DEMO_VISIT_COOKIE, crypto.randomUUID(), {
    path: "/",
    maxAge: 60 * 60 * 6,
    sameSite: "lax",
  });
  return response;
}
