import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { WorkshopForm } from '@/components/partner/WorkshopForm';
import { SubmitWorkshopButton } from '@/components/partner/SubmitWorkshopButton';
import { DeleteButton } from '@/components/partner/DeleteButton';

export const dynamic = 'force-dynamic';

const wStatus: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã công khai', REJECTED: 'Bị từ chối', CANCELLED: 'Đã hủy',
};

export default async function PartnerWorkshopsPage() {
  const user = await requireApprovedPartner();
  const supabase = await supabaseServer();
  const { data: workshops, error } = await supabase
    .from('workshops')
    .select('*, workshop_sessions(*, workshop_registrations(id, status))')
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Quản lý workshop</h1>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo workshop mới (nhiều buổi)</h2>
        <WorkshopForm />
      </div>
      <div className="mt-8 space-y-4">
        {workshops.map((w) => (
          <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{w.title}</h3>
                <p className="text-sm text-slate-500">{wStatus[w.status] ?? w.status}</p>
                {w.status === 'REJECTED' && w.reject_reason && <p className="text-sm text-red-600">{w.reject_reason}</p>}
              </div>
              <div className="flex gap-2">
                {(w.status === 'DRAFT' || w.status === 'REJECTED') && <SubmitWorkshopButton workshopId={w.id} />}
                <DeleteButton url={`/api/partner/workshops/${w.id}`} label="Xóa" />
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {(w.workshop_sessions ?? []).map((s: { id: string; starts_at: string; location: string; fee: string; capacity: number; remaining_seats: number; status: string; workshop_registrations: { id: string; status: string }[] }) => {
                const confirmed = (s.workshop_registrations ?? []).filter((r) => r.status === 'CONFIRMED').length;
                return (
                  <li key={s.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    {new Date(s.starts_at).toLocaleString('vi-VN')} · {s.location} · {formatVnd(s.fee)} ·
                    Sức chứa {s.capacity} · còn {s.remaining_seats} · {confirmed} đăng ký xác nhận · {s.status}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {workshops.length === 0 && <p className="text-slate-500">Chưa có workshop nào.</p>}
      </div>
    </div>
  );
}
