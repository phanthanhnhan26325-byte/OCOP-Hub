import { requireRole } from '@/lib/rbac';
import { PartnerNavigation } from '@/components/partner/PartnerNavigation';
import './partner.css';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  await requireRole('PARTNER');
  return (
    <div className="partner-portal min-h-full bg-[#f5f8f5] text-[#193b3a]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row lg:px-6">
        <PartnerNavigation />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
