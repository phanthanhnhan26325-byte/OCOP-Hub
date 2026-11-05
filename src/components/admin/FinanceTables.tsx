'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDate, formatVnd } from '@/lib/money';
import type { FinanceTransaction } from '@/lib/admin-finance-transactions';

export interface FinancePartnerRow {
  partnerId: string;
  name: string;
  orderCount: number;
  gmv: number;
  commission: number;
  payable: number;
  status: string;
  statementId: string | null;
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function FinanceExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  function download() {
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => csvCell(String(value))).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
      Xuất Excel (.csv)
    </button>
  );
}

export function FinancePartnerTable({
  rows,
  showCommission = true,
}: {
  rows: FinancePartnerRow[];
  showCommission?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('gmv_desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return rows
      .filter((row) => (!query || row.name.toLocaleLowerCase('vi').includes(query)))
      .filter((row) => (!status || row.status === status))
      .sort((a, b) => {
        switch (sort) {
          case 'name_asc': return a.name.localeCompare(b.name, 'vi');
          case 'orders_desc': return b.orderCount - a.orderCount;
          case 'commission_desc': return b.commission - a.commission;
          case 'gmv_asc': return a.gmv - b.gmv;
          default: return b.gmv - a.gmv;
        }
      });
  }, [rows, search, sort, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold text-slate-900">Doanh thu theo doanh nghiệp</h2>
          <p className="mt-1 text-xs text-slate-500">GMV là tổng giá trị hàng hóa; hoa hồng lấy từ phí đã lưu trên đơn, không tính GMV thành doanh thu OCOP Hub.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm doanh nghiệp" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Mọi trạng thái đối soát</option>
            <option value="Chưa đối soát">Chưa đối soát</option>
            <option value="Nháp">Nháp</option>
            <option value="Đã xác nhận">Đã xác nhận</option>
            <option value="Đã chi trả">Đã chi trả</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="gmv_desc">GMV cao nhất</option>
            <option value="gmv_asc">GMV thấp nhất</option>
            <option value="commission_desc">Hoa hồng cao nhất</option>
            <option value="orders_desc">Nhiều đơn nhất</option>
            <option value="name_asc">Tên A–Z</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[790px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-3">Doanh nghiệp</th>
              <th className="px-4 py-3">Đơn thành công</th>
              <th className="px-4 py-3">GMV</th>
              {showCommission && <th className="px-4 py-3">Hoa hồng thực tế</th>}
              <th className="px-4 py-3">Phải trả ước tính</th>
              <th className="px-4 py-3">Đối soát</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((row) => (
              <tr key={row.partnerId}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-4 py-3">{row.orderCount.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatVnd(row.gmv)}</td>
                {showCommission && <td className="px-4 py-3 whitespace-nowrap">{formatVnd(row.commission)}</td>}
                <td className="px-4 py-3 whitespace-nowrap">{formatVnd(row.payable)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{row.status}</span></td>
                <td className="px-4 py-3">
                  {row.statementId
                    ? <Link href={`/admin/finance/reconciliation/${row.statementId}`} className="font-medium text-emerald-800 hover:underline">Xem chi tiết</Link>
                    : <Link href={`/admin/users/${row.partnerId}`} className="font-medium text-emerald-800 hover:underline">Doanh nghiệp</Link>}
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={showCommission ? 7 : 6} className="px-4 py-8 text-center text-slate-500">Không có dữ liệu doanh nghiệp phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span>{filtered.length} doanh nghiệp · Trang {currentPage}/{pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Trước</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Sau</button>
        </div>
      </div>
    </section>
  );
}

export function FinanceTransactionTable({
  transactions,
  showFilters = true,
  pageSize = 15,
}: {
  transactions: FinanceTransaction[];
  showFilters?: boolean;
  pageSize?: number;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return transactions
      .filter((row) => !type || row.type === type)
      .filter((row) => !query || [
        row.code, row.related, row.description, row.orderCode, row.partnerName, row.status,
      ].some((value) => value.toLocaleLowerCase('vi').includes(query)));
  }, [search, transactions, type]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const types = [...new Set(transactions.map((row) => row.type))].sort((a, b) => a.localeCompare(b, 'vi'));

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <label className="text-xs font-medium text-slate-600">
            Loại giao dịch
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Tất cả loại</option>
              {types.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="min-w-60 flex-1 text-xs font-medium text-slate-600">
            Mã đơn, doanh nghiệp, mã giao dịch hoặc trạng thái
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nhập nội dung tìm kiếm" />
          </label>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Mã giao dịch</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Đối tượng / nguồn</th>
              <th className="px-4 py-3">Nội dung</th>
              <th className="px-4 py-3 text-right">Số tiền</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Nguồn dữ liệu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(row.at)}</td>
                <td className="max-w-48 truncate px-4 py-3 font-mono text-xs" title={row.code}>{row.code}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.related}</td>
                <td className="max-w-64 truncate px-4 py-3 text-slate-500" title={row.description}>{row.description}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${row.direction === 'IN' ? 'text-emerald-700' : row.direction === 'OUT' ? 'text-rose-700' : 'text-amber-700'}`}>
                  {row.direction === 'IN' ? '+' : row.direction === 'OUT' ? '−' : '↻'}{formatVnd(row.amount)}
                </td>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{row.status}</span></td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{row.source}</td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Không có giao dịch phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span>{filtered.length} giao dịch · Trang {currentPage}/{pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Trước</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Sau</button>
        </div>
      </div>
    </section>
  );
}
