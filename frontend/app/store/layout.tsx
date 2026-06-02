import type { Metadata } from 'next';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

export const metadata: Metadata = {
  title: 'Script Store - RBX Royale',
  description: 'Browse premium licensed Roblox scripts. UI systems, utilities, game mechanics, and more.',
  openGraph: {
    title: 'Script Store - RBX Royale',
    description: 'Premium licensed Roblox scripts for game developers.',
  },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Breadcrumbs />
      {children}
    </>
  );
}
