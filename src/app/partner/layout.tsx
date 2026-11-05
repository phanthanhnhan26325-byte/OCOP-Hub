import { requireRole } from '@/lib/rbac';
import { PartnerNavigation } from '@/components/partner/PartnerNavigation';
import './partner.css';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  await requireRole('PARTNER');
  return <div className="partner-portal min-h-full bg-[#f5f8f5] text-[#193b3a]"><PartnerNavigation />{children}</div>;
}
