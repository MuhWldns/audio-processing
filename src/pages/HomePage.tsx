import { Link } from "react-router-dom";
import logo from "../assets/hero.png";

const highlights = [
  {
    title: "Quick audio prep",
    description: "Load a track, make a few changes, and get it ready to use.",
  },
  {
    title: "Clear output options",
    description: "Save your file in the format that fits your workflow.",
  },
  {
    title: "Simple account upload",
    description: "Keep the finished file in one place and send it where you need it.",
  },
];

export function HomePage() {
  return (
    <div className="space-y-10">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-violet-300/20 bg-violet-500/10 px-4 py-2 text-sm text-violet-100 shadow-[0_0_30px_rgba(147,51,234,0.16)]">
            <span className="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.8)]" />
            RBX Royale Community
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">Turn your audio into a Roblox-ready track with a few simple steps.</h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300">Grab audio from YouTube or SoundCloud, tweak speed and amplification, and upload it instantly to Roblox.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/studio"
              className="inline-flex items-center justify-center rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] hover:from-violet-400 hover:to-fuchsia-400"
            >
              Open Editor
            </Link>
            <a
              href="#highlights"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
            >
              See highlights
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-4xl border border-violet-300/20 bg-[linear-gradient(180deg,rgba(20,13,43,0.95),rgba(10,8,20,0.96))] p-8 shadow-[0_30px_80px_rgba(10,7,24,0.65)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(204,102,255,0.24),transparent_38%)]" />
          <div className="relative space-y-6">
            <img className="mx-auto w-56 rounded-4xl border border-white/10 bg-white/5 object-contain p-3 shadow-[0_0_30px_rgba(184,110,255,0.28)]" src={logo} alt="RBX Royale Community logo" />

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Upload", "Drop in a file and start right away."],
                ["Adjust", "Change the sound to fit your track."],
                ["Preview", "Listen back before you save."],
                ["Export", "Choose the format you want."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="highlights" className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => (
          <article key={item.title} className="rounded-3xl border border-violet-300/15 bg-white/5 p-6 shadow-[0_20px_60px_rgba(5,3,15,0.28)] backdrop-blur">
            <h2 className="text-lg font-semibold text-white">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
