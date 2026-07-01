import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-2xl text-white">
            ⚓
          </div>
          <h1 className="text-xl font-bold text-slate-900">ניהול צי סירות</h1>
          <p className="mt-1 text-sm text-slate-500">התחברו כדי להמשיך</p>
        </div>
        <LoginForm redirectTo={redirectTo || "/"} />
      </div>
    </div>
  );
}
