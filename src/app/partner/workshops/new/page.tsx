import Link from 'next/link';
import { requireApprovedPartner } from '@/lib/rbac';
import { WorkshopForm } from '@/components/partner/WorkshopForm';

export const dynamic = 'force-dynamic';

export default async function NewPartnerWorkshopPage() {
  await requireApprovedPartner();
  return <div className="max-w-5xl">
    <Link href="/partner/workshops" className="text-sm font-medium text-[#195c46] hover:underline">← Danh sách workshop</Link>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Tạo workshop</h1><Link href="/partner/workshops" className="partner-action">Quay lại danh sách</Link></div>
    <p className="mt-2 text-sm leading-6 partner-muted">Điền thông tin, thêm các buổi tổ chức và gửi workshop để hệ thống phê duyệt.</p>
    <section className="partner-panel mt-6 p-5 sm:p-7"><WorkshopForm /></section>
  </div>;
}
