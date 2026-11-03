// Next.js replaces the message of any Error thrown by a server action with a
// generic sentence in production builds ("An error occurred in the Server
// Components render. The specific message is omitted in production builds to
// avoid leaking sensitive details..."), so showing err.message from a caught
// action error put that English text in front of the user. Use this instead:
// it keeps a real message (when there is one, e.g. in development) and falls
// back to the given translated text otherwise. Expected, user-facing failures
// should be returned from the action as { error } rather than thrown - only
// unexpected failures should reach here.
export function actionErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message && !/Server Components render/i.test(err.message)) {
    return err.message;
  }
  return fallback;
}
