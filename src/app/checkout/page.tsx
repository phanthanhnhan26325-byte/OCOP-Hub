import { CheckoutForm } from '@/components/customer/CheckoutForm';

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Thông tin giao nhận</h1>
      <p className="mt-1 text-sm text-slate-500">
        Hệ thống sẽ tạo đơn chung và tách thành từng phần đơn theo từng doanh nghiệp. Phí giao nhận (nếu có) được áp theo từng doanh nghiệp.
      </p>
      <div className="mt-6">
        <CheckoutForm />
      </div>
    </div>
  );
}
