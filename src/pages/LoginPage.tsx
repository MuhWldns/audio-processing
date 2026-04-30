import { Navigate, useLocation } from "react-router-dom";
import { authUrls } from "../api/auth";
import { useAuth } from "../context/AuthContext";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname || "/studio";

  if (!isLoading && user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="mx-auto flex min-h-[70svh] max-w-3xl items-center justify-center px-4">
      <div className="w-full rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(20,13,43,0.94),rgba(10,8,20,0.96))] p-8 shadow-[0_30px_80px_rgba(10,7,24,0.65)] sm:p-10">
        <div className="space-y-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.35em] text-violet-200/80">Login</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Sign in to continue to the editor</h1>
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-300">Use Google or Discord to access your audio tools, history, and token balance.</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <a
            href={authUrls.google}
            className="inline-flex items-center justify-center rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] hover:from-violet-400 hover:to-fuchsia-400"
          >
            Continue with Google
          </a>
          <a
            href={authUrls.discord}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Continue with Discord
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-white/8 bg-white/5 p-4 text-left text-sm leading-7 text-slate-300">
          <p className="font-semibold text-white">What happens after login</p>
          <p className="mt-1">You will be redirected to your editor page, and your session will stay active until you log out.</p>
        </div>
      </div>
    </div>
  );
}
