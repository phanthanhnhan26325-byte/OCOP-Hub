'use client';

import { useMemo, useState } from 'react';

export interface PublicReview {
  id: string;
  display_name: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewStats {
  review_count: number;
  average_rating: number;
  one_star: number;
  two_stars: number;
  three_stars: number;
  four_stars: number;
  five_stars: number;
}

export interface ReviewPurchase {
  id: string;
  label: string;
  review: Pick<PublicReview, 'id' | 'rating' | 'comment'> | null;
}

interface ReviewsSectionProps {
  type: 'product' | 'workshop';
  targetId: string;
  available: boolean;
  reviews: PublicReview[];
  stats: ReviewStats;
  purchases: ReviewPurchase[];
}

function Stars({ rating, large = false }: { rating: number; large?: boolean }) {
  return (
    <span aria-label={`${rating} trên 5 sao`} className={`inline-flex tracking-wide text-amber-500 ${large ? 'text-xl' : 'text-sm'}`}>
      {'★'.repeat(rating)}<span className="text-slate-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value));
}

export function ReviewsSection({ type, targetId, available, reviews: initialReviews, stats: initialStats, purchases: initialPurchases }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [purchases, setPurchases] = useState(initialPurchases);
  const [stats, setStats] = useState(initialStats);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(initialPurchases[0]?.id ?? '');
  const selectedPurchase = purchases.find((purchase) => purchase.id === selectedPurchaseId);
  const [rating, setRating] = useState(selectedPurchase?.review?.rating ?? 5);
  const [comment, setComment] = useState(selectedPurchase?.review?.comment ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const average = Number(stats.average_rating) || 0;
  const ratingCounts = useMemo(() => [
    stats.five_stars,
    stats.four_stars,
    stats.three_stars,
    stats.two_stars,
    stats.one_star,
  ], [stats]);
  const title = type === 'product' ? 'Đánh giá sản phẩm' : 'Đánh giá trải nghiệm';

  function choosePurchase(id: string) {
    const purchase = purchases.find((item) => item.id === id);
    setSelectedPurchaseId(id);
    setRating(purchase?.review?.rating ?? 5);
    setComment(purchase?.review?.comment ?? '');
    setMessage(null);
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPurchase) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          targetId,
          purchaseId: selectedPurchase.id,
          rating,
          comment,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ text: result?.error?.message ?? 'Không thể gửi đánh giá. Vui lòng thử lại.', error: true });
        return;
      }

      const savedReview = result.review as PublicReview;
      const previousRating = selectedPurchase.review?.rating ?? null;
      setStats((current) => {
        const nextCount = current.review_count + (previousRating === null ? 1 : 0);
        const nextTotal = current.average_rating * current.review_count - (previousRating ?? 0) + rating;
        const counts = [current.one_star, current.two_stars, current.three_stars, current.four_stars, current.five_stars];
        if (previousRating !== null) counts[previousRating - 1] -= 1;
        counts[rating - 1] += 1;
        return {
          review_count: nextCount,
          average_rating: nextCount ? nextTotal / nextCount : 0,
          one_star: counts[0],
          two_stars: counts[1],
          three_stars: counts[2],
          four_stars: counts[3],
          five_stars: counts[4],
        };
      });
      setReviews((current) => [
        savedReview,
        ...current.filter((review) => review.id !== savedReview.id),
      ].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 100));
      setPurchases((current) => current.map((purchase) => purchase.id === selectedPurchase.id
        ? { ...purchase, review: { id: savedReview.id, rating: savedReview.rating, comment: savedReview.comment } }
        : purchase));
      setMessage({ text: 'Đánh giá của bạn đã được lưu và hiển thị công khai.', error: false });
    } catch {
      setMessage({ text: 'Không thể kết nối. Vui lòng thử lại.', error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="reviews" className="mt-10 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Chia sẻ từ khách hàng đã mua hàng hoặc tham gia thực tế.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-emerald-700">{average.toFixed(1)}</span>
          <div><Stars rating={Math.round(average)} /><p className="mt-1 text-xs text-slate-500">{stats.review_count} đánh giá</p></div>
        </div>
      </div>

      {!available ? (
        <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Tính năng đánh giá chưa được bật trên cơ sở dữ liệu. Quản trị viên cần áp dụng migration <code className="font-semibold">0037_verified_reviews.sql</code> và làm mới schema cache của Supabase để hiển thị và gửi đánh giá.
        </div>
      ) : (
      <>
      <div className="grid gap-6 py-5 sm:grid-cols-[minmax(190px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2" aria-label="Phân bố số sao">
          {ratingCounts.map((count, index) => {
            const score = 5 - index;
            const percentage = stats.review_count ? (count / stats.review_count) * 100 : 0;
            return (
              <div key={score} className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-8">{score} sao</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${percentage}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>

        {purchases.length > 0 ? (
          <form onSubmit={submitReview} className="space-y-3 rounded-xl bg-[#f7f8f0] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">{selectedPurchase?.review ? 'Chỉnh sửa đánh giá' : 'Để lại đánh giá'}</h3>
              {purchases.length > 1 && (
                <label className="text-xs text-slate-600">
                  Giao dịch
                  <select value={selectedPurchaseId} onChange={(event) => choosePurchase(event.target.value)} className="ml-2 max-w-48 rounded-md border border-slate-200 bg-white px-2 py-1">
                    {purchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.label}{purchase.review ? ' · Đã đánh giá' : ''}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Chọn số sao">
              {[1, 2, 3, 4, 5].map((score) => (
                <button key={score} type="button" aria-label={`${score} sao`} aria-pressed={rating === score} onClick={() => setRating(score)} className={`text-2xl leading-none ${score <= rating ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
              ))}
              <span className="ml-2 text-sm text-slate-600">{rating}/5</span>
            </div>
            <label className="block text-sm text-slate-700">
              Nhận xét (không bắt buộc)
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} placeholder="Chia sẻ cảm nhận của bạn..." className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-emerald-500" />
              <span className="mt-1 block text-right text-xs text-slate-400">{comment.length}/1000</span>
            </label>
            {message && <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-red-700' : 'text-emerald-700'}`}>{message.text}</p>}
            <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {pending ? 'Đang lưu...' : selectedPurchase?.review ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
            </button>
          </form>
        ) : (
          <p className="rounded-xl bg-[#f7f8f0] p-4 text-sm leading-6 text-slate-600">
            Đăng nhập bằng tài khoản đã nhận sản phẩm hoặc hoàn thành buổi trải nghiệm để gửi đánh giá.
          </p>
        )}
      </div>

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {reviews.length ? reviews.map((review) => (
          <article key={review.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 font-semibold text-emerald-800">{Array.from(review.display_name)[0] ?? 'K'}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{review.display_name}</p>
                  <p className="text-xs text-emerald-700">✓ Đã mua hàng/trải nghiệm</p>
                </div>
              </div>
              <time className="text-xs text-slate-400">{formattedDate(review.updated_at)}</time>
            </div>
            <div className="mt-2"><Stars rating={review.rating} /></div>
            {review.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.comment}</p>}
          </article>
        )) : (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có đánh giá. Hãy là người đầu tiên chia sẻ cảm nhận!</p>
        )}
      </div>
      </>
      )}
    </section>
  );
}
