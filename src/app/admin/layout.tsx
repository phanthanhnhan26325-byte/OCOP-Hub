import { Suspense } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row lg:px-6">
      <Suspense fallback={<div aria-hidden="true" className="w-full shrink-0 md:w-64" />}>
        <AdminSidebar />
      </Suspense>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
