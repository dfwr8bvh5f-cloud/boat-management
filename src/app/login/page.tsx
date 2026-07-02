import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-fleet-paper"
      style={{ background: "linear-gradient(160deg, #0B1F38 0%, #15324F 60%, #13283F 100%)" }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-3xl">⚓</div>
      <h1 className="mt-4 text-3xl font-light tracking-[0.2em]">MYS FLEET</h1>
      <div className="my-3 h-px w-9 bg-fleet-brass opacity-70" />
      <p className="mb-8 text-sm opacity-75">התחברו כדי להמשיך</p>

      <div className="w-full max-w-sm rounded-xl border border-fleet-brass/40 bg-white/[0.08] p-6">
        <LoginForm redirectTo={redirectTo || "/"} />
      </div>
    </div>
  );
}
