import Link from 'next/link';

const links: [string, string][] = [
  ['/admin', 'Tổng quan'],
  ['/admin/partner-applications', 'Duyệt đăng ký bán hàng'],
  ['/admin/products', 'Duyệt sản phẩm'],
  ['/admin/workshops', 'Duyệt workshop'],
  ['/admin/orders', 'Giám sát đơn hàng'],
  ['/admin/payments', 'Giám sát thanh toán'],
  ['/admin/refunds', 'Hoàn tiền'],
  ['/admin/settlements', 'Đối soát'],
];

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
