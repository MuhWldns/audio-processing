import Link from "next/link";
import Image from "next/image";

const services = [
  {
    title: "Premium Scripts",
    description: "Verified, licensed Roblox scripts ready to use in your game. UI systems, utilities, and game mechanics.",
    cta: "Browse Store",
    href: "/store",
    primary: true,
  },
  {
    title: "Audio Tools",
    description: "Process audio for your Roblox game. Adjust EQ, reverb, gain, and export in multiple formats.",
    cta: "Open Editor",
    href: "/audio/studio",
    primary: false,
  },
];

const features = [
  {
    title: "Licensed & Verified",
    description: "Every script comes with a license key and real-time verification for your Roblox games.",
  },
  {
    title: "Multiple Tiers",
    description: "Personal, Commercial, or Enterprise. Pick the license that fits your project scale.",
  },
  {
    title: "Instant Delivery",
    description: "Purchase with your Rupiah wallet, get your license key and script files immediately.",
  },
  {
    title: "Audio Processing",
    description: "Browser-based audio editor with EQ, reverb, and export to WAV, MP3, or OGG.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-violet-300/20 bg-violet-500/10 px-4 py-2 text-sm text-violet-100 shadow-[0_0_30px_rgba(147,51,234,0.16)]">
            <span className="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.8)]" />
            RBX Royale
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Premium scripts and audio tools for Roblox developers.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300">
              Browse licensed scripts, manage your game integrations, and process audio — all in one platform built for Roblox creators.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/store"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] hover:from-violet-400 hover:to-fuchsia-400"
            >
              Browse Store
            </Link>
            <Link
              href="/audio/studio"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
            >
              Audio Editor
            </Link>
          </div>
        </div>

        {/* Service Cards */}
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[linear-gradient(180deg,rgba(20,13,43,0.95),rgba(10,8,20,0.96))] p-8 shadow-[0_30px_80px_rgba(10,7,24,0.65)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(204,102,255,0.24),transparent_38%)]" />
          <div className="relative space-y-6">
            <Image className="mx-auto w-56 rounded-[2rem] border border-white/10 bg-white/5 object-contain p-3 shadow-[0_0_30px_rgba(184,110,255,0.28)]" src="/hero.png" alt="RBX Royale logo" width={224} height={224} />

            <div className="grid gap-3">
              {services.map((service) => (
                <Link
                  key={service.title}
                  href={service.href}
                  className="rounded-2xl border border-white/[0.08] bg-white/5 p-4 transition hover:border-violet-300/20 hover:bg-white/[0.08]"
                >
                  <p className="text-sm font-semibold text-white">{service.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{service.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((item) => (
          <article key={item.title} className="rounded-3xl border border-violet-300/15 bg-white/5 p-6 shadow-[0_20px_60px_rgba(5,3,15,0.28)] backdrop-blur">
            <h2 className="text-lg font-semibold text-white">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
          </article>
        ))}
      </section>

      {/* CTA */}
      <section className="rounded-3xl bg-gradient-to-br from-violet-600/20 via-fuchsia-600/10 to-transparent p-8 sm:p-12 ring-1 ring-white/10 text-center">
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready to level up your game?</h2>
        <p className="mt-3 text-slate-300 max-w-xl mx-auto">Top up your wallet with QRIS, browse the store, and get your scripts running in minutes.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link
            href="/store"
            className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Explore Scripts
          </Link>
          <Link
            href="/topup"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-8 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Top Up Wallet
          </Link>
        </div>
      </section>
    </div>
  );
}
