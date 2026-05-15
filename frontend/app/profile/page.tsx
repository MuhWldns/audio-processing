'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Profile</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Redirecting...</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Mengarahkan ke dashboard...</p>
      </div>
    </div>
  );
}
