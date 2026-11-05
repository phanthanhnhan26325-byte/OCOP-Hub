'use client';

export function FinancePrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden">
      In / lưu biên bản
    </button>
  );
}
