
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Profile {
  business_name?: string;
  business_license_no?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
}

export function SellingApplicationForm({
  existing,
}: {
  existing: Profile | null;
}) {
  const [form, setForm] = useState({
    businessName: existing?.business_name ?? '',
    businessLicenseNo: existing?.business_license_no ?? '',
    address: existing?.address ?? '',
    contactEmail: existing?.contact_email ?? '',
    contactPhone: existing?.contact_phone ?? '',
    note: '',
  });

  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);

        startTransition(async () => {
          try {
            const res = await fetch(
              '/api/partner/selling-application',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(form),
              }
            );

            const data = await res.json().catch(() => null);

            if (res.ok) {
              setMsg('Đã gửi hồ sơ — chờ Admin phê duyệt');
              router.refresh();
            } else {
              setMsg(
                data?.error?.message ?? 'Gửi hồ sơ thất bại'
              );
            }
          } catch {
            setMsg('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        });
      }}
      className="mt-4 space-y-3"
    >
      {msg && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm">
          {msg}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Tên doanh nghiệp *
          <input
            required
            minLength={2}
            value={form.businessName}
            onChange={(e) =>
              setForm({
                ...form,
                businessName: e.target.value,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>

        <label className="text-sm">
          Số giấy phép kinh doanh *
          <input
            required
            minLength={5}
            value={form.businessLicenseNo}
            onChange={(e) =>
              setForm({
                ...form,
                businessLicenseNo: e.target.value,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>

        <label className="text-sm">
          Email liên hệ *
          <input
            type="email"
            required
            value={form.contactEmail}
            onChange={(e) =>
              setForm({
                ...form,
                contactEmail: e.target.value,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>

        <label className="text-sm">
          Số điện thoại *
          <input
            required
            minLength={8}
            value={form.contactPhone}
            onChange={(e) =>
              setForm({
                ...form,
                contactPhone: e.target.value,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        Địa chỉ doanh nghiệp *
        <input
          required
          minLength={5}
          value={form.address}
          onChange={(e) =>
            setForm({
              ...form,
              address: e.target.value,
            })
          }
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        Ghi chú
        <textarea
          value={form.note}
          onChange={(e) =>
            setForm({
              ...form,
              note: e.target.value,
            })
          }
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending
          ? 'Đang gửi...'
          : 'Gửi hồ sơ đăng ký bán hàng'}
      </button>
    </form>
  );
}
