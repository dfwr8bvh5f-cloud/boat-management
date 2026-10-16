import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A single public link anyone can open to land inside the app already
// signed in as the read-only demo account (role "owner", scoped to the
// DEMO SPIRIT sample boat - see the Settings conversation that created it;
// "owner" has no insert/update/delete access anywhere in the RLS policies,
// so nothing a visitor does here can touch real data) - no email/password
// ever shown or typed. The credentials are known only server-side; the env
// vars let them be rotated without a code change, but fall back to the
// account actually created so this works without extra setup.
const DEMO_EMAIL = process.env.DEMO_GUEST_EMAIL || "demo-guest@mysfleet-demo.com";
const DEMO_PASSWORD = process.env.DEMO_GUEST_PASSWORD || "DemoGuest2026!";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

  if (error) {
    console.error("/demo sign-in failed:", error.message);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
