import { orderStatuses, orderStatusTone, paymentStatuses, paymentStatusTone } from '@/modules/orders/partner-order-view';

export function OrderBadge({ status, payment = false }: { status: string; payment?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${payment ? paymentStatusTone(status) : orderStatusTone(status)}`}><span aria-hidden="true">●</span>{(payment ? paymentStatuses : orderStatuses)[status] ?? status}</span>;
}
