'use client';

import { useRouter } from 'next/navigation';

export function RevenueFilter({ month }: { month: string }) {
  const router = useRouter();
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <label htmlFor="revenue-month" className="partner-muted">Tháng thanh toán</label>
    <input id="revenue-month" type="month" value={month} min="2000-01" max="9999-12" onChange={(event) => {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) router.push(`/partner?month=${event.target.value}`, { scroll: false });
    }} className="min-w-0 rounded-lg border border-[#dce6e1] bg-white px-2 py-1.5 text-[#195c46]" />
  </div>;
}
