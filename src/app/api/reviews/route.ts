import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const reviewSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('product'),
    targetId: z.string().uuid(),
    purchaseId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000),
  }),
  z.object({
    type: z.literal('workshop'),
    targetId: z.string().uuid(),
    purchaseId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000),
  }),
]);

function publicDisplayName(fullName: string | null | undefined) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.length
    ? parts.map((part) => `${Array.from(part)[0]}***`).join(' ')
    : 'Khách hàng';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('CUSTOMER');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Dữ liệu đánh giá không hợp lệ.' } },
        { status: 400 },
      );
    }
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join('; ') } },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const admin = supabaseAdmin();
    const { data: customer, error: customerError } = await admin
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();
    if (customerError) throw new Error(customerError.message);

    if (input.type === 'product') {
      const { data: item, error } = await admin
        .from('order_items')
        .select('id, product_id, orders!inner(customer_id, status, order_level)')
        .eq('id', input.purchaseId)
        .eq('product_id', input.targetId)
        .eq('orders.customer_id', user.id)
        .eq('orders.order_level', 'CHILD')
        .in('orders.status', ['DELIVERED', 'COMPLETED'])
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!item) {
        return NextResponse.json(
          { error: { code: 'REVIEW_NOT_ELIGIBLE', message: 'Chỉ khách đã nhận sản phẩm mới có thể đánh giá.' } },
          { status: 403 },
        );
      }

      const { data: review, error: reviewError } = await admin
        .from('product_reviews')
        .upsert({
          order_item_id: input.purchaseId,
          product_id: input.targetId,
          customer_id: user.id,
          display_name: publicDisplayName(customer.full_name),
          rating: input.rating,
          comment: input.comment,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'order_item_id' })
        .select('id, product_id, display_name, rating, comment, created_at, updated_at')
        .single();
      if (reviewError) throw new Error(reviewError.message);
      return NextResponse.json({ review, purchaseId: input.purchaseId }, { status: 200 });
    }

    const { data: registration, error } = await admin
      .from('workshop_registrations')
      .select('id, workshop_sessions!inner(workshop_id)')
      .eq('id', input.purchaseId)
      .eq('customer_id', user.id)
      .eq('status', 'COMPLETED')
      .eq('workshop_sessions.workshop_id', input.targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!registration) {
      return NextResponse.json(
        { error: { code: 'REVIEW_NOT_ELIGIBLE', message: 'Chỉ khách đã tham gia workshop mới có thể đánh giá.' } },
        { status: 403 },
      );
    }

    const { data: review, error: reviewError } = await admin
      .from('workshop_reviews')
      .upsert({
        registration_id: input.purchaseId,
        workshop_id: input.targetId,
        customer_id: user.id,
        display_name: publicDisplayName(customer.full_name),
        rating: input.rating,
        comment: input.comment,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'registration_id' })
      .select('id, workshop_id, display_name, rating, comment, created_at, updated_at')
      .single();
    if (reviewError) throw new Error(reviewError.message);
    return NextResponse.json({ review, purchaseId: input.purchaseId }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
