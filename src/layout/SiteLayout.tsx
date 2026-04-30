import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import logo from "../assets/hero.png";

const fallbackAvatar = "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  ["rounded-full px-4 py-2 text-sm font-medium transition", isActive ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30" : "text-slate-300 hover:bg-white/5 hover:text-white"].join(" ");

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  ["block rounded-lg px-4 py-3 text-base font-medium transition", isActive ? "bg-violet-500/25 text-violet-100" : "text-slate-300 hover:bg-white/5 hover:text-white"].join(" ");

export function SiteLayout() {
  const { user, logout, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(186,90,255,0.16),transparent_26%),radial-gradient(circle_at_80%_10%,rgba(109,70,255,0.18),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(223,89,255,0.12),transparent_28%),linear-gradient(180deg,#0a0814_0%,#06040e_100%)] text-violet-50">
      <header className="border-b border-white/8 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-6">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden"
            >
              <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <Link to="/" className="flex items-center gap-3">
              <img className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 object-contain p-1.5 shadow-[0_0_18px_rgba(184,110,255,0.32)]" src={logo} alt="RBX Royale Community logo" />
              <div className="leading-tight">
                <p className="text-[11px] uppercase tracking-[0.35em] text-violet-200/80">RBX Royale Community</p>
                <p className="text-sm text-slate-300">Audio editing and uploads</p>
              </div>
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-2 md:flex">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/studio" className={navLinkClass}>
              Editor
            </NavLink>
            <NavLink to="/history" className={navLinkClass}>
              History
            </NavLink>
            <NavLink to="/profile" className={navLinkClass}>
              Profile
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            {!isLoading && user ? (
              <>
                <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 md:flex">
                  <img
                    className="h-8 w-8 rounded-full object-cover"
                    src={user.avatarUrl || fallbackAvatar}
                    alt={user.displayName || user.email || "User"}
                    onError={(event) => {
                      if (event.currentTarget.src !== fallbackAvatar) {
                        event.currentTarget.src = fallbackAvatar;
                      }
                    }}
                  />
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-white">{user.displayName || user.fullName || user.email || "Logged in user"}</p>
                    <p className="text-xs text-slate-400">{user.wallet ? `${user.wallet.balanceTokens} tokens` : "No wallet"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.25)] transition hover:scale-[1.02]"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <div className="border-b border-white/8 bg-black/40 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <nav className="space-y-2">
              <NavLink to="/" end className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Home
              </NavLink>
              <NavLink to="/studio" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Editor
              </NavLink>
              <NavLink to="/history" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                History
              </NavLink>
              <NavLink to="/profile" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Profile
              </NavLink>
              {user && (
                <>
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <img
                        className="h-10 w-10 rounded-full object-cover"
                        src={user.avatarUrl || fallbackAvatar}
                        alt={user.displayName || user.email || "User"}
                        onError={(event) => {
                          if (event.currentTarget.src !== fallbackAvatar) {
                            event.currentTarget.src = fallbackAvatar;
                          }
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-white">{user.displayName || user.fullName || user.email || "User"}</p>
                        <p className="text-sm text-slate-400">{user.wallet?.balanceTokens ?? 0} tokens</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void logout();
                        setMobileMenuOpen(false);
                      }}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left font-medium text-slate-300 transition hover:bg-white/10"
                    >
                      Logout
                    </button>
                  </div>
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-7xl px-6 pb-10 pt-2 text-sm text-slate-400/90">Made to help you edit audio, export it, and send it to your account quickly.</footer>
    </div>
  );
}
