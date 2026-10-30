import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata = { title: 'Đăng ký — OCOP Hub' };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-center text-2xl font-bold">Tạo tài khoản</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <RegisterForm />
      </div>
    </div>
  );
}
