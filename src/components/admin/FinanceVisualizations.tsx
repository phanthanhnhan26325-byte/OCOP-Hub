import { formatVnd } from '@/lib/money';

export interface FinanceChartPoint {
  label: string;
  gmv: number;
  commission: number;
  shipping: number;
  operating: number;
  profit: number;
}

export function FinanceTrendChart({ points }: { points: FinanceChartPoint[] }) {
  if (points.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có dữ liệu trong khoảng thời gian này.</p>;
  }

  const width = 840;
  const height = 300;
  const left = 64;
  const right = 18;
  const top = 18;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = points.flatMap((point) => [
    point.gmv, point.commission, point.shipping, point.profit,
  ]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const valueRange = maxValue - minValue;
  const x = (index: number) => left + (points.length === 1 ? chartWidth / 2 : index * chartWidth / (points.length - 1));
  const y = (value: number) => top + ((maxValue - value) / valueRange) * chartHeight;
  const lines = [
    { key: 'gmv', name: 'GMV', color: '#0f766e' },
    { key: 'commission', name: 'Hoa hồng', color: '#e11d48' },
    { key: 'shipping', name: 'Vận chuyển', color: '#f59e0b' },
    { key: 'profit', name: 'Lợi nhuận ước tính', color: '#7c3aed' },
  ] as const;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {lines.map((line) => (
          <span key={line.key} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ GMV, hoa hồng, chi phí vận chuyển và lợi nhuận">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = maxValue - valueRange * fraction;
            const lineY = top + chartHeight - chartHeight * fraction;
            return (
              <g key={fraction}>
                <line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2e8f0" strokeDasharray={fraction === 0 ? undefined : '3 4'} />
                <text x={left - 8} y={lineY + 4} textAnchor="end" fill="#64748b" fontSize="10">
                  {new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}
                </text>
              </g>
            );
          })}
          {lines.map((line) => {
            const path = points.map((point, index) =>
              `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point[line.key])}`,
            ).join(' ');
            return (
              <g key={line.key}>
                <path d={path} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((point, index) => (
                  <circle key={`${line.key}-${point.label}`} cx={x(index)} cy={y(point[line.key])} r="3.5" fill="white" stroke={line.color} strokeWidth="2">
                    <title>{`${point.label} · ${line.name}: ${formatVnd(point[line.key])}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {points.map((point, index) => (
            <text key={point.label} x={x(index)} y={height - 18} textAnchor="middle" fill="#64748b" fontSize="10">
              {point.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function FinanceComposition({
  values,
}: {
  values: { label: string; amount: number; color: string }[];
}) {
  const positiveValues = values.filter((entry) => entry.amount > 0);
  const total = positiveValues.reduce((sum, entry) => sum + entry.amount, 0);
  if (total <= 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có khoản thu/chi được ghi nhận trong kỳ.</p>;
  }
  const circumference = 2 * Math.PI * 58;
  const segments = positiveValues.reduce<{
    label: string;
    amount: number;
    color: string;
    length: number;
    offset: number;
  }[]>((result, entry) => {
    const offset = result.length > 0
      ? result[result.length - 1].offset + result[result.length - 1].length
      : 0;
    result.push({
      ...entry,
      length: circumference * entry.amount / total,
      offset,
    });
    return result;
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img" aria-label="Cơ cấu tài chính trong kỳ">
        <circle cx="80" cy="80" r="58" fill="none" stroke="#f1f5f9" strokeWidth="24" />
        {segments.map((entry) => {
          return (
            <circle
              key={entry.label}
              cx="80"
              cy="80"
              r="58"
              fill="none"
              stroke={entry.color}
              strokeWidth="24"
              strokeDasharray={`${entry.length} ${circumference - entry.length}`}
              strokeDashoffset={-entry.offset}
              transform="rotate(-90 80 80)"
            >
              <title>{`${entry.label}: ${formatVnd(entry.amount)} (${(entry.amount / total * 100).toFixed(1)}%)`}</title>
            </circle>
          );
        })}
        <text x="80" y="76" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="600">Tổng ghi nhận</text>
        <text x="80" y="94" textAnchor="middle" fill="#0f172a" fontSize="10">{new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(total)} đ</text>
      </svg>
      <ul className="w-full space-y-3">
        {positiveValues.map((entry) => (
          <li key={entry.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="truncate">{entry.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-medium text-slate-800">{formatVnd(entry.amount)}</span>
              <span className="text-xs text-slate-500">{(entry.amount / total * 100).toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
