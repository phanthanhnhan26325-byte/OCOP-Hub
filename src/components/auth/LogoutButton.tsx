'use client';

import { useRouter } from 'next/navigation';
import { logoutAction } from '@/modules/auth/actions';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await logoutAction();
        router.push('/');
        router.refresh();
      }}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200"
    >
      Đăng xuất
    </button>
  );
}
