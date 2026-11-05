'use client';

import Link from 'next/link';
import { useState } from 'react';

interface OrderFiltersProps {
  search: string;
  orderStatus: string;
  paymentStatus: string;
  from: string | null;
  to: string | null;
  sort: string;
  orderStatuses: readonly string[];
  paymentStatuses: readonly string[];
  orderStatusLabels: Record<string, string>;
  paymentStatusLabels: Record<string, string>;
}

export function OrderFilters({
  search: initialSearch,
  orderStatus: initialOrderStatus,
  paymentStatus: initialPaymentStatus,
  from: initialFrom,
  to: initialTo,
  sort: initialSort,
  orderStatuses,
  paymentStatuses,
  orderStatusLabels,
  paymentStatusLabels,
}: OrderFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [from, setFrom] = useState(initialFrom ?? '');
  const [to, setTo] = useState(initialTo ?? '');
  const [sort, setSort] = useState(initialSort);

  return (
    <form action="/admin/orders" method="get" className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-xs font-medium text-slate-600 xl:col-span-2">
          Tìm mã đơn hoặc khách hàng
          <input
            name="q"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder="Nhập mã đơn, tên hoặc email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Trạng thái đơn
          <select
            name="status"
            value={orderStatus}
            onChange={(e) => setOrderStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Tất cả trạng thái</option>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>{orderStatusLabels[status]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Trạng thái thanh toán
          <select
            name="payment"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Tất cả thanh toán</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>{paymentStatusLabels[status]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Từ ngày
          <input
            name="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Đến ngày
          <input
            name="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-medium text-slate-600 xl:col-span-2">
          Sắp xếp
          <select
            name="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="newest">Ngày đặt: mới nhất</option>
            <option value="oldest">Ngày đặt: cũ nhất</option>
            <option value="total_desc">Tổng tiền: cao đến thấp</option>
            <option value="total_asc">Tổng tiền: thấp đến cao</option>
            <option value="code_asc">Mã đơn: A–Z</option>
          </select>
        </label>
        <div className="flex items-end gap-2 xl:col-span-4">
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Lọc đơn hàng
          </button>
          <Link href="/admin/orders" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Xóa bộ lọc
          </Link>
        </div>
      </div>
    </form>
  );
}
