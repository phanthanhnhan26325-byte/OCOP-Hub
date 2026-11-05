'use client';

export default function PartnerError({ reset }: { reset: () => void }) {
  return <div role="alert" className="mx-auto max-w-3xl px-6 py-16"><div className="partner-panel p-8"><h1 className="text-xl font-semibold">Chưa thể tải dữ liệu doanh nghiệp</h1><p className="mt-3 text-sm partner-muted">Vui lòng kiểm tra kết nối và thử lại. Nếu lỗi tiếp diễn, hãy liên hệ quản trị viên để kiểm tra cấu hình dữ liệu.</p><button onClick={reset} className="partner-action mt-5">Thử lại</button></div></div>;
}
