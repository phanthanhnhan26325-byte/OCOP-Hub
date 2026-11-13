import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { WorkshopForm } from '@/components/partner/WorkshopForm';

export default async function EditWorkshopPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApprovedPartner();
  const { id } = await params;
  const db = await supabaseServer();
  const { data: workshop, error } = await db.from('workshops')
    .select('id, title, slug, description, experience_content, cover_image, status, reject_reason, workshop_sessions(id, starts_at, ends_at, location, fee, capacity, workshop_registrations(id))')
    .eq('id', id).eq('partner_id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!workshop) notFound();
  workshop.workshop_sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
  return <div className="max-w-5xl">
    <Link href="/partner/workshops" className="text-sm text-emerald-800 hover:underline">← Danh sách workshop</Link>
    <h1 className="mt-5 text-2xl font-semibold">Sửa workshop</h1>
    {workshop.reject_reason && <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">Lý do từ chối: {workshop.reject_reason}</p>}
    <p className="mt-3 text-sm text-slate-500">Thông tin hiện tại đã được điền sẵn. Sau khi lưu, workshop sẽ được gửi duyệt lại. Các đăng ký hiện có được giữ nguyên.</p>
    <section className="partner-panel mt-6 p-5 sm:p-7"><WorkshopForm workshop={workshop} /></section>
  </div>;
}
