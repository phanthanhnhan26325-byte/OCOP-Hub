'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

interface SessionRow { id?: string; startsAt: string; endsAt: string; location: string; fee: number; capacity: number }

export interface EditableWorkshop {
  id: string; title: string; slug: string; description: string | null;
  experience_content?: string | null; cover_image?: string | null;
  workshop_sessions: { id: string; starts_at: string; ends_at: string; location: string; fee: number; capacity: number; workshop_registrations?: { id: string }[] }[];
}

function localDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)).replace(' ', 'T');
}

export function WorkshopForm(props: { workshop?: EditableWorkshop }) {
  return <WorkshopFormFields key={JSON.stringify(props.workshop ?? null)} {...props} />;
}

function WorkshopFormFields({ workshop }: { workshop?: EditableWorkshop }) {
  const [title, setTitle] = useState(workshop?.title ?? '');
  const [description, setDescription] = useState(workshop?.description ?? '');
  const [experienceContent, setExperienceContent] = useState(workshop?.experience_content ?? '');
  const [coverImage, setCoverImage] = useState(workshop?.cover_image ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>(workshop ? workshop.workshop_sessions.map(s => ({
    id: s.id, startsAt: localDateTime(s.starts_at), endsAt: localDateTime(s.ends_at), location: s.location, fee: s.fee, capacity: s.capacity,
  })) : [
    { startsAt: '', endsAt: '', location: '', fee: 0, capacity: 20 },
  ]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function update(i: number, patch: Partial<SessionRow>) {
    setSessions((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeSession(i: number) {
    const session = sessions[i];
    const savedSession = workshop?.workshop_sessions.find(row => row.id === session.id);
    if (savedSession?.workshop_registrations?.length) {
      alert('Không thể xóa buổi này vì đã có khách hàng đăng ký tham gia.');
      return;
    }
    if (sessions.length === 1) {
      alert('Workshop cần có ít nhất một buổi tổ chức.');
      return;
    }
    setSessions(rows => rows.filter((_, index) => index !== i));
    setMsg('Buổi đã được bỏ khỏi biểu mẫu. Bấm lưu để cập nhật thay đổi.');
  }

  function slugify(t: string) {
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (workshop && !imageFile && title.trim() === workshop.title &&
          description === (workshop.description ?? '') && experienceContent === (workshop.experience_content ?? '') &&
          coverImage === (workshop.cover_image ?? '') && sessions.length === workshop.workshop_sessions.length &&
          sessions.every(session => {
            const original = workshop.workshop_sessions.find(row => row.id === session.id);
            return original && session.startsAt === localDateTime(original.starts_at) && session.endsAt === localDateTime(original.ends_at) &&
              session.location.trim() === original.location && Number(session.fee) === Number(original.fee) && Number(session.capacity) === Number(original.capacity);
          })) {
          setMsg('Bạn chưa thay đổi thông tin workshop. Không cần gửi duyệt lại.');
          return;
        }
        startTransition(async () => {
          const db = supabaseBrowser();
          let uploadedPath: string | null = null;
          let saved = false;
          try {
            if (sessions.some(s => new Date(s.endsAt) <= new Date(s.startsAt))) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
            setMsg('Đang lưu và gửi workshop để phê duyệt...');
            let imageUrl = coverImage;
            if (imageFile) {
              const { data: { user }, error: authError } = await db.auth.getUser();
              if (authError || !user) throw new Error('Vui lòng đăng nhập lại để tải ảnh.');
              const path = `${user.id}/${crypto.randomUUID()}.${imageFile.type === 'image/png' ? 'png' : 'jpg'}`;
              const { error } = await db.storage.from('ocop-workshop-images-v1').upload(path, imageFile, { contentType: imageFile.type });
              if (error) throw new Error(`Không thể tải ảnh workshop: ${error.message}`);
              uploadedPath = path;
              imageUrl = db.storage.from('ocop-workshop-images-v1').getPublicUrl(path).data.publicUrl;
            }
            const res = await fetch(workshop ? `/api/partner/workshops/${workshop.id}` : '/api/partner/workshops', {
              method: workshop ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                slug: workshop?.slug ?? slugify(title),
                description,
                experienceContent,
                coverImage: imageUrl || null,
                action: 'submit',
                sessions: sessions.map((s) => ({
                  id: s.id,
                  startsAt: new Date(`${s.startsAt}:00+07:00`).toISOString(),
                  endsAt: new Date(`${s.endsAt}:00+07:00`).toISOString(),
                  location: s.location,
                  fee: s.fee,
                  capacity: s.capacity,
                })),
              }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error?.message ?? 'Gửi workshop thất bại');
            saved = true;
            setMsg('Đã gửi workshop thành công. Vui lòng chờ admin phê duyệt.');
            router.push(`/partner/workshops#${workshop?.id ?? data.id}`);
            router.refresh();
          } catch (error) {
            if (uploadedPath && !saved) await db.storage.from('ocop-workshop-images-v1').remove([uploadedPath]);
            setMsg(error instanceof Error ? error.message : 'Gửi workshop thất bại');
          }
        });
      }}
      className="space-y-6"
    >
      <section className="space-y-5">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">01</span><div><h2 className="text-lg font-semibold">Thông tin chung</h2><p className="mt-1 text-xs text-slate-500">Giới thiệu trải nghiệm đến khách hàng.</p></div></div>
      <label className="block text-sm">Tên workshop *
        <input required value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm">Mô tả ngắn
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm">Nội dung trải nghiệm
        <textarea rows={5} value={experienceContent} onChange={e => setExperienceContent(e.target.value)} placeholder="Mô tả các hoạt động, kiến thức và trải nghiệm người tham gia nhận được..." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3" />
      </label>
      <label className="block text-sm">Ảnh đại diện workshop
        <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={pending} onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMsg('Vui lòng chọn ảnh PNG hoặc JPG không quá 5 MB.'); return; }
          setImageFile(file); setMsg(null);
        }} className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 p-4" />
        <span className="mt-2 block text-xs text-slate-500">{imageFile ? imageFile.name : 'PNG hoặc JPG, tối đa 5 MB.'}</span>
      </label>
      {coverImage && !imageFile && <img src={coverImage} alt="Ảnh đại diện workshop hiện tại" className="h-40 w-64 rounded-xl object-cover" />}
      {(imageFile || coverImage) && <button type="button" className="text-sm text-red-600" onClick={() => { setImageFile(null); setCoverImage(''); }}>Xóa ảnh đã chọn</button>}
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">02</span><div><h2 className="text-lg font-semibold">Lịch tổ chức</h2><p className="mt-1 text-xs text-slate-500">Mỗi buổi có thời gian, địa điểm và sức chứa riêng.</p></div></div>
      <p className="text-xs text-slate-500">Thời gian theo múi giờ Việt Nam (UTC+7).</p>
      {sessions.map((s, i) => (
        <div key={i} className="grid gap-5 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 sm:p-5 [&_input]:min-w-0 [&_input]:bg-white [&_input]:px-3 [&_input]:py-3">
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <h3 className="text-sm font-semibold">Buổi {i + 1}</h3>
            <button type="button" disabled={pending} onClick={() => removeSession(i)} aria-label={`Xóa buổi ${i + 1}`} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">Xóa buổi</button>
          </div>
          <label className="text-xs">Bắt đầu *<input type="datetime-local" required value={s.startsAt} onChange={(e) => update(i, { startsAt: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Kết thúc *<input type="datetime-local" required value={s.endsAt} onChange={(e) => update(i, { endsAt: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs sm:col-span-2">Địa điểm *<input required value={s.location} onChange={(e) => update(i, { location: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Phí (VNĐ)<input type="number" min={0} value={s.fee} onChange={(e) => update(i, { fee: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Sức chứa *<input type="number" min={1} required value={s.capacity} onChange={(e) => update(i, { capacity: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
        </div>
      ))}
      <button type="button" onClick={() => setSessions([...sessions, { startsAt: '', endsAt: '', location: '', fee: 0, capacity: 20 }])}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
        + Thêm buổi
      </button>
      </section>
      <div>
        {msg && <p role="status" aria-live="polite" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
        <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? 'Đang gửi...' : workshop ? 'Lưu thay đổi và gửi duyệt lại' : 'Gửi workshop chờ phê duyệt'}
        </button>
      </div>
    </form>
  );
}
