import Link from 'next/link';

const sections = [
  { href: '/admin/finance', label: 'Tổng quan' },
  { href: '/admin/finance/revenue', label: 'Doanh thu & lợi nhuận' },
  { href: '/admin/finance/reconciliation', label: 'Đối soát doanh nghiệp' },
  { href: '/admin/finance/payouts', label: 'Quản lý chi trả' },
  { href: '/admin/finance/transactions', label: 'Lịch sử giao dịch' },
  { href: '/admin/finance/settings', label: 'Cấu hình tài chính' },
];

export function FinanceWorkspace({
  active,
  title,
  description,
  children,
}: {
  active: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">OCOP HUB · TRUNG TÂM TÀI CHÍNH</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
        </div>
      </header>
      <nav aria-label="Phân hệ tài chính" className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active === section.href ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${
              active === section.href
                ? 'bg-emerald-50 font-semibold text-emerald-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function FinanceDateFilters({
  range,
  from,
  to,
  grouping,
}: {
  range: string;
  from: string;
  to: string;
  grouping?: string;
}) {
  return (
    <form action="" method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <label className="text-xs font-medium text-slate-600">
        Khoảng thời gian
        <select name="range" defaultValue={range} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="today">Hôm nay</option>
          <option value="7d">7 ngày gần nhất</option>
          <option value="30d">30 ngày gần nhất</option>
          <option value="month">Tháng này</option>
          <option value="last_month">Tháng trước</option>
          <option value="quarter">Quý này</option>
          <option value="year">Năm nay</option>
          <option value="custom">Tùy chọn</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Từ ngày
        <input name="from" type="date" defaultValue={from} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Đến ngày
        <input name="to" type="date" defaultValue={to} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      {grouping && (
        <label className="text-xs font-medium text-slate-600">
          Nhóm biểu đồ
          <select name="group" defaultValue={grouping} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="day">Ngày</option>
            <option value="week">Tuần</option>
            <option value="month">Tháng</option>
            <option value="quarter">Quý</option>
            <option value="year">Năm</option>
          </select>
        </label>
      )}
      <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
        Áp dụng
      </button>
    </form>
  );
}

export function FinanceCard({
  title,
  value,
  caption,
  trend,
  accent = 'emerald',
}: {
  title: string;
  value: string;
  caption: string;
  trend?: { value: number; label: string };
  accent?: 'emerald' | 'rose' | 'violet' | 'blue' | 'amber';
}) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
    blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
  }[accent];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${styles}`}>↗</span>
      </div>
      <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">{value}</p>
      {trend && (
        <p className={`mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}% {trend.label}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </article>
  );
}
