import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

const testimonials = [
  {
    name: 'Nguyễn Thị Mai',
    title: 'Khách hàng ở Hà Nội',
    quote:
      'Mình rất ưng với chất lượng sản phẩm, đóng gói đẹp và giao hàng đúng hẹn. Đặc biệt thích phần workshop vì có thể hiểu thêm về nguồn gốc và cách làm.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Trần Văn Hùng',
    title: 'Đầu bếp địa phương',
    quote:
      'OCOP Hub giúp mình dễ dàng tìm đến các sản phẩm truyền thống và kết nối với những người làm nghề sạch, bền vững. Giao diện rất dễ dùng.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Lê Thị Hạnh',
    title: 'Khách hàng ở Đà Nẵng',
    quote:
      'Tôi đã đặt mua sản phẩm OCOP cho gia đình và cả nhóm cùng tham gia workshop. Không chỉ ngon, mà còn rất đáng để chia sẻ cho bạn bè.',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=200&q=80',
  },
];

export default async function HomePage() {
  const supabase = await supabaseServer();
  const [{ data: products }, { data: workshops }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, slug, price, short_description, product_images(url, sort_order), partner_profiles(business_name)')
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('workshops')
      .select('id, title, slug, cover_image, workshop_sessions(fee, starts_at, remaining_seats, status)')
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const featuredProducts = products?.slice(0, 3) ?? [];
  const featuredWorkshops = workshops?.slice(0, 3) ?? [];
  const workshopHighlights: Array<{ id?: string | number; title: string; desc: string; slug: string }> = featuredWorkshops.length > 0
    ? featuredWorkshops.map((item) => ({
        id: item.id,
        title: item.title,
        desc: 'Tham gia để trải nghiệm và học hỏi từ các nghệ nhân.',
        slug: `/workshops/${item.slug}`,
      }))
    : [{ id: undefined, title: 'Workshop sắp mở', desc: 'Cập nhật sớm nhất từ cộng đồng OCOP.', slug: '/workshops' }];

  return (
    <div className="bg-[#f7f4ec] text-slate-800">
      <section className="mx-auto max-w-7xl px-4 pb-6 pt-10 lg:px-6">
        <div className="rounded-[2rem] border border-[#d7d0b8] bg-[#f2ead4] px-5 py-6 shadow-[0_12px_30px_rgba(25,58,39,0.08)] md:px-8 md:py-8 lg:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center rounded-full border border-[#b9b39a] bg-[#f9f5eb] px-3 py-1 text-sm font-medium text-[#2f5c3a]">
                Sản vật Việt · Trải nghiệm thật
              </div>

              <div className="space-y-4">
                <h1 className="font-[Georgia,serif] text-5xl leading-[0.92] tracking-[-0.06em] text-[#1d4d38] md:text-6xl lg:text-[6rem]">
                  Mang tinh hoa
                  <span className="block text-[#0e5740]">địa phương đến</span>
                  <span className="block text-[#1d4d38]">gần bạn.</span>
                </h1>

                <p className="max-w-xl text-lg leading-8 text-[#395c4b]">
                  Khám phá sản phẩm OCOP, bản sắc Việt và workshop sáng tạo từ những cộng đồng nông thôn, mang sức sống của làng quê vào từng ngày của bạn.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/products" className="rounded-2xl bg-[#1d4d38] px-6 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-[#123b2d]/20 transition hover:bg-[#173d30]">
                  Khám phá sản phẩm
                </Link>
                <Link href="/workshops" className="rounded-2xl border border-[#244d3e] bg-transparent px-6 py-4 text-center text-lg font-semibold text-[#1d4d38] transition hover:bg-white/40">
                  Khám phá workshop
                </Link>
              </div>
            </div>

            <div className="relative flex justify-center lg:justify-end">
              <div className="absolute inset-0 -z-10 rounded-[30%] bg-[radial-gradient(circle,_rgba(255,255,255,0.8),_rgba(255,255,255,0)_70%)] blur-2xl" />
              <div className="relative h-[440px] w-full max-w-[560px] overflow-hidden rounded-[2rem] border border-[#d7d0b8] bg-[#d7d0b8] shadow-[0_18px_35px_rgba(20,50,38,0.15)]">
                <img
                  src="https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80"
                  alt="Farmers and OCOP products"
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-5 left-5 rounded-2xl border border-white/30 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#2e5944]">Nguồn gốc rõ ràng</p>
                  <p className="mt-1 text-xl font-semibold text-[#1b4738]">Sản phẩm nông sản chính gốc</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: 'Sản phẩm chuẩn OCOP', text: 'Được lựa chọn từ các cơ sở sản xuất uy tín, giữ nguyên giá trị bản địa.' },
            { title: 'Hiệu quả thật', text: 'Đặt hàng nhanh, thanh toán rõ ràng, hỗ trợ chăm sóc khách hàng tận tâm.' },
            { title: 'Kết nối cộng đồng', text: 'Mở rộng thị trường cho nông sản địa phương và workshop truyền thống.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#d7d0b8] bg-white/60 p-5 shadow-sm">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#edf7ef] text-lg text-[#1d4d38]">✓</div>
              <h3 className="text-xl font-semibold text-[#1d4d38]">{item.title}</h3>
              <p className="mt-2 text-base leading-7 text-[#45655a]">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2f5c3a]">GIAN HÀNG ĐỊA PHƯƠNG</p>
            <h2 className="mt-2 font-[Georgia,serif] text-4xl leading-none tracking-[-0.05em] text-[#1d4d38] md:text-5xl">
              Sản vật được yêu thích
            </h2>
          </div>
          <Link href="/products" className="text-lg font-semibold text-[#1d4d38] hover:text-[#163a2d]">
            Xem tất cả →
          </Link>
        </div>

        {featuredProducts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-slate-500">
            Chưa có sản phẩm được phê duyệt.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {featuredProducts.map((p) => (
              <Link key={p.id} href={`/products/${p.slug}`} className="group overflow-hidden rounded-[1.75rem] border border-[#d7d0b8] bg-white p-3 shadow-[0_12px_25px_rgba(13,45,35,0.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_28px_rgba(13,45,35,0.08)]">
                <div className="aspect-[4/3] overflow-hidden rounded-[1.3rem] bg-slate-100">
                  <img
                    src={p.product_images?.[0]?.url ?? 'https://placehold.co/800x600?text=OCOP'}
                    alt={p.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="mt-4 space-y-2 px-1 pb-2">
                  <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.12em] text-[#568067]">
                    <span>{(p.partner_profiles as unknown as { business_name: string } | null)?.business_name ?? 'OCOP Hub'}</span>
                    <span>Địa phương</span>
                  </div>
                  <h3 className="text-2xl font-semibold leading-tight text-[#173e2f]">{p.name}</h3>
                  <p className="text-sm leading-6 text-[#45655a]">{p.short_description}</p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xl font-bold text-[#1d4d38]">{formatVnd(p.price)}</span>
                    <span className="rounded-full bg-[#eefaf2] px-3 py-1 text-sm font-medium text-[#26634b]">Mua ngay</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#0d4d35] py-12 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:px-6">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_12px_35px_rgba(0,0,0,0.15)]">
            <img
              src="https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80"
              alt="Workshop craft"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#d8f1df]">TRẢI NGHIỆM BỀN VỮNG</p>
            <h2 className="mt-4 font-[Georgia,serif] text-5xl leading-[0.95] tracking-[-0.06em] md:text-6xl">
              Tự tay chạm
              <span className="block">vào một câu</span>
              <span className="block">chuyện nghề.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#d6e9de]">
              Gặp gỡ nghệ nhân, hiểu nguyên liệu và mang những kỹ năng truyền thống vào cuộc sống hiện đại mỗi ngày.
            </p>

            <div className="mt-8 space-y-4">
              {workshopHighlights.map((item) => (
                <div key={item.id ?? item.title} className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-[#d3eadb]">{item.desc}</p>
                    </div>
                    <Link href={item.slug} className="rounded-xl bg-[#f3d979] px-4 py-2 text-sm font-bold text-[#0d4d35] hover:bg-[#e7c853]">
                      {item.title === 'Workshop sắp mở' ? 'Tìm hiểu' : 'Tham gia'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#2f5c3a]">Khách hàng nói gì</p>
            <h2 className="mt-2 font-[Georgia,serif] text-4xl leading-none tracking-[-0.04em] text-[#1d4d38] md:text-5xl">
              Đánh giá từ cộng đồng
            </h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {testimonials.map((person) => (
            <div key={person.name} className="rounded-[1.6rem] border border-[#d7d0b8] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <img src={person.avatar} alt={person.name} className="h-14 w-14 rounded-full object-cover" />
                <div>
                  <p className="font-semibold text-[#1d4d38]">{person.name}</p>
                  <p className="text-sm text-[#627d70]">{person.title}</p>
                </div>
              </div>
              <p className="mt-4 text-base leading-7 text-[#425f54]">“{person.quote}”</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
