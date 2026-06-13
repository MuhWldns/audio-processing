import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center text-center">
      <div className="space-y-6">
        <div className="text-8xl font-bold text-violet-500/30">404</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Page not found
        </h1>
        <p className="max-w-md text-slate-300">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link
            href="/"
            className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Back to Home
          </Link>
          <Link
            href="/store"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Browse Store
          </Link>
        </div>
      </div>
    </div>
  );
}
