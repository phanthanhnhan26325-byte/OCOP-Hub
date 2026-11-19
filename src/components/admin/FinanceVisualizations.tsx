import { formatVnd } from '@/lib/money';

export interface FinanceChartPoint {
  label: string;
  gmv: number;
  commission: number;
  operating: number;
  profit: number;
}

function formatFinanceAxisLabel(label: string, grouping: string) {
  if (grouping === 'year') return label;

  if (grouping === 'quarter') {
    const match = /^(\d{4})-Q([1-4])$/.exec(label);
    return match ? `Q${match[2]}/${match[1].slice(-2)}` : label;
  }

  if (grouping === 'week') {
    const match = /^(\d{4})-W(\d{2})$/.exec(label);
    return match ? `T${match[2]}/${match[1].slice(-2)}` : label;
  }

  if (grouping === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(label);
    return match ? `${match[2]}/${match[1].slice(-2)}` : label;
  }

  const date = new Date(`${label}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? label
    : new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        timeZone: 'UTC',
      }).format(date);
}

export function FinanceTrendChart({
  points,
  grouping,
}: {
  points: FinanceChartPoint[];
  grouping: string;
}) {
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
  const tickStep = Math.max(1, Math.ceil((points.length - 1) / 7));
  const values = points.flatMap((point) => [
    point.gmv, point.commission, point.profit,
  ]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const valueRange = maxValue - minValue;
  const x = (index: number) => left + (points.length === 1 ? chartWidth / 2 : index * chartWidth / (points.length - 1));
  const y = (value: number) => top + ((maxValue - value) / valueRange) * chartHeight;
  const lines = [
    { key: 'gmv', name: 'GMV', color: '#0f766e' },
    { key: 'commission', name: 'Hoa hồng', color: '#e11d48' },
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
            index % tickStep !== 0 && index !== points.length - 1 ? null :
            <text key={point.label} x={x(index)} y={height - 18} textAnchor="middle" fill="#64748b" fontSize="10">
              <title>{point.label}</title>
              {formatFinanceAxisLabel(point.label, grouping)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function FinanceComposition({
  revenue,
  profit,
}: {
  revenue: number;
  profit: number;
}) {
  const hasLoss = profit < 0;
  const rows = [
    { label: 'Doanh thu hoa hồng', amount: Math.max(revenue, 0), color: '#e11d48' },
    {
      label: hasLoss ? 'Lỗ ước tính' : 'Lợi nhuận ước tính',
      amount: Math.abs(profit),
      color: hasLoss ? '#dc2626' : '#7c3aed',
    },
  ];
  const pieValues = rows.filter((entry) => entry.amount > 0);
  const pieTotal = pieValues.reduce((sum, entry) => sum + entry.amount, 0);
  if (pieTotal <= 0 || pieValues.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có doanh thu hoa hồng hoặc lợi nhuận được ghi nhận trong kỳ.</p>;
  }
  const percentageByLabel = new Map<string, number>();
  let roundedTotal = 0;
  pieValues.forEach((entry, index) => {
    const percentage = index === pieValues.length - 1
      ? 100 - roundedTotal
      : Number((entry.amount / pieTotal * 100).toFixed(1));
    percentageByLabel.set(entry.label, percentage);
    roundedTotal += percentage;
  });
  const segments = pieValues.map((entry, index) => {
    const previousAmount = pieValues
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.amount, 0);
    const startAngle = -Math.PI / 2 + previousAmount / pieTotal * Math.PI * 2;
    const endAngle = startAngle + entry.amount / pieTotal * Math.PI * 2;
    const startX = 100 + 88 * Math.cos(startAngle);
    const startY = 100 + 88 * Math.sin(startAngle);
    const endX = 100 + 88 * Math.cos(endAngle);
    const endY = 100 + 88 * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return {
      ...entry,
      path: `M 100 100 L ${startX} ${startY} A 88 88 0 ${largeArc} 1 ${endX} ${endY} Z`,
    };
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="shrink-0 text-center">
          <svg viewBox="0 0 200 200" className="h-48 w-48" role="img" aria-label="Biểu đồ tròn cơ cấu tài chính">
            {segments.length === 1
              ? <circle cx="100" cy="100" r="88" fill={segments[0].color}><title>{`${segments[0].label}: ${formatVnd(segments[0].amount)} (100%)`}</title></circle>
              : segments.map((entry) => (
                  <path key={entry.label} d={entry.path} fill={entry.color}>
                    <title>{`${entry.label}: ${formatVnd(entry.amount)} (${percentageByLabel.get(entry.label)}%)`}</title>
                  </path>
                ))}
          </svg>
          <p className="mt-1 text-xs text-slate-500">
            Tổng doanh thu và {hasLoss ? 'lỗ' : 'lợi nhuận'} · {formatVnd(pieTotal)}
          </p>
        </div>
        <ul className="w-full space-y-3">
          {rows.map((entry) => (
            <li key={entry.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="truncate">{entry.label}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-medium text-slate-800">{formatVnd(entry.amount)}</span>
                <span className="text-xs text-slate-500">{(percentageByLabel.get(entry.label) ?? 0).toFixed(1)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Tỷ lệ là phần của mỗi chỉ số trên tổng doanh thu hoa hồng và {hasLoss ? 'lỗ' : 'lợi nhuận'} ước tính.
      </p>
    </div>
  );
}
