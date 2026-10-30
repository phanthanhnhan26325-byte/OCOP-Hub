'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAction } from '@/modules/auth/actions';

export function RegisterForm() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'CUSTOMER' as 'CUSTOMER' | 'PARTNER' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await registerAction(form);
          if (result.ok) {
            setOk(true);
            setTimeout(() => router.push('/login'), 1200);
          } else {
            setError(result.message);
          }
        });
      }}
      className="space-y-4"
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Đăng ký thành công! Đang chuyển tới đăng nhập...</div>}
      <fieldset className="rounded-lg border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-medium">Tôi đăng ký với tư cách</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={form.role === 'CUSTOMER'} onChange={() => setForm({ ...form, role: 'CUSTOMER' })} />
            Khách hàng (mua sản phẩm, đăng ký workshop)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={form.role === 'PARTNER'} onChange={() => setForm({ ...form, role: 'PARTNER' })} />
            Doanh nghiệp (bán hàng, tổ chức workshop)
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Lưu ý: vai trò doanh nghiệp cần được Admin phê duyệt bán hàng trước khi đăng sản phẩm.
        </p>
      </fieldset>
      <label className="block text-sm">
        Họ và tên
        <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <label className="block text-sm">
        Email
        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <label className="block text-sm">
        Mật khẩu (tối thiểu 8 ký tự)
        <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <button disabled={pending} className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? 'Đang đăng ký...' : 'Tạo tài khoản'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Đã có tài khoản? <Link href="/login" className="text-emerald-700 hover:underline">Đăng nhập</Link>
      </p>
    </form>
  );
}
