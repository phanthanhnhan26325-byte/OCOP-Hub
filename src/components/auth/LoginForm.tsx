'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/modules/auth/actions';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await loginAction({ email, password });
          if (result.ok) {
            router.push(next);
            router.refresh();
          } else {
            setError(result.message);
          }
        });
      }}
      className="space-y-4"
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <label className="block text-sm">
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <label className="block text-sm">
        Mật khẩu
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <button disabled={pending} className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Chưa có tài khoản? <Link href="/register" className="text-emerald-700 hover:underline">Đăng ký</Link>
      </p>
    </form>
  );
}
