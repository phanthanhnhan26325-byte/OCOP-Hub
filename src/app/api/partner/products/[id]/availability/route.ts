import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const supplyStatusSchema = z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER']);
const preOrderEtaSchema = z.union([z.string().date(), z.literal(''), z.null()]).optional();

const variantAvailabilitySchema = z.object({
  id: z.string().uuid(),
  availableQty: z.number().int().min(0),
  supplyStatus: supplyStatusSchema,
  preOrderEta: preOrderEtaSchema,
}).refine(data => data.supplyStatus !== 'PRE_ORDER' || Boolean(data.preOrderEta), {
  path: ['preOrderEta'], message: 'Vui lòng chọn ngày dự kiến có hàng khi nhận đặt trước.',
}).refine(data => data.supplyStatus !== 'OUT_OF_STOCK' || data.availableQty === 0, {
  path: ['availableQty'], message: 'Số lượng cung ứng phải bằng 0 khi hết hàng.',
});

const productAvailabilitySchema = z.object({
  availableQty: z.number().int().min(0),
  supplyStatus: supplyStatusSchema,
  preOrderEta: preOrderEtaSchema,
}).refine(data => data.supplyStatus !== 'PRE_ORDER' || Boolean(data.preOrderEta), {
  path: ['preOrderEta'], message: 'Vui lòng chọn ngày dự kiến có hàng khi nhận đặt trước.',
}).refine(data => data.supplyStatus !== 'OUT_OF_STOCK' || data.availableQty === 0, {
  path: ['availableQty'], message: 'Số lượng cung ứng phải bằng 0 khi hết hàng.',
});

const variantsPayloadSchema = z.object({
  variants: z.array(variantAvailabilitySchema).min(1, 'Vui lòng cung cấp ít nhất một biến thể'),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApprovedPartner();
    const { id } = await params;
    const rawBody = await request.json();
    const supabase = await supabaseServer();

    if (rawBody && typeof rawBody === 'object' && 'variants' in rawBody) {
      const body = variantsPayloadSchema.safeParse(rawBody);
      if (!body.success) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: body.error.issues.map((issue) => issue.message).join('; ') } },
          { status: 400 },
        );
      }
      const { error } = await supabase.rpc('partner_update_variant_availability', {
        p_product: id,
        p_variants: body.data.variants.map((variant) => ({
          id: variant.id,
          availableQty: variant.availableQty,
          supplyStatus: variant.supplyStatus,
          preOrderEta: variant.preOrderEta || null,
        })),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const body = productAvailabilitySchema.safeParse(rawBody);
    if (!body.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: body.error.issues.map((issue) => issue.message).join('; ') } },
        { status: 400 },
      );
    }

    const { error } = await supabase.rpc('partner_update_product_availability', {
      p_product: id,
      p_available_qty: body.data.availableQty,
      p_supply_status: body.data.supplyStatus,
      p_pre_order_eta: body.data.preOrderEta || null,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
