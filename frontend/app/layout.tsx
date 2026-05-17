import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/Toast'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: {
    default: 'RBX Royale - Scripts & Audio Tools',
    template: '%s | RBX Royale',
  },
  description: 'Premium licensed Roblox scripts and browser-based audio processing tools for game developers. Browse, purchase, and manage scripts with built-in license verification.',
  keywords: ['roblox', 'scripts', 'roblox scripts', 'game development', 'audio processing', 'rbx royale', 'lua scripts', 'roblox store'],
  authors: [{ name: 'RBX Royale' }],
  creator: 'RBX Royale',
  metadataBase: new URL('https://audio.muhwldns.me'),
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: 'https://audio.muhwldns.me',
    siteName: 'RBX Royale',
    title: 'RBX Royale - Scripts & Audio Tools',
    description: 'Premium licensed Roblox scripts and audio processing tools for game developers.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RBX Royale - Scripts & Audio Tools',
    description: 'Premium licensed Roblox scripts and audio processing tools for game developers.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(186,90,255,0.16),transparent_26%),radial-gradient(circle_at_80%_10%,rgba(109,70,255,0.18),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(223,89,255,0.12),transparent_28%),linear-gradient(180deg,#0a0814_0%,#06040e_100%)] text-violet-50">
        <AuthProvider>
          <ToastProvider>
            <Header />
            <main className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
              {children}
            </main>
            <footer className="mx-auto w-full max-w-7xl px-6 pb-10 pt-2 text-sm text-slate-400/90">
              RBX Royale — Scripts, audio tools, and everything you need to build better Roblox games.
            </footer>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
