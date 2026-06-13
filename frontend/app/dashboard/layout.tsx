import type { Metadata } from 'next';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

export const metadata: Metadata = {
  title: 'Dashboard - RBX Royale',
  description: 'Manage your licenses, wallet, and account settings.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Breadcrumbs />
      {children}
    </>
  );
}
