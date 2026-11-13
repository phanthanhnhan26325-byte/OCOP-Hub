import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const supplyStatusSchema = z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER']);

const patchSchema = z.object({
  name: z.string().min(3).optional(),
  shortDescription: z.string().max(300).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/).optional(),
  categoryId: z.string().uuid().optional(),
  ocopCertNo: z.string().optional(),
  images: z.array(z.string().url()).min(1).max(10).optional(),
  variants: z.array(z.object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(80),
    price: z.number().positive(),
    availableQty: z.number().int().min(0).optional(),
    supplyStatus: supplyStatusSchema.optional(),
    preOrderEta: z.union([z.string().date(), z.literal(''), z.null()]).optional(),
  })).superRefine((variants, ctx) => {
    variants.forEach((variant, index) => {
      if (variant.supplyStatus === 'PRE_ORDER' && !variant.preOrderEta) {
        ctx.addIssue({ code: 'custom', path: [index, 'preOrderEta'], message: 'Vui lòng chọn ngày dự kiến có hàng khi nhận đặt trước' });
      }
      if (variant.supplyStatus === 'OUT_OF_STOCK' && variant.availableQty !== undefined && variant.availableQty !== 0) {
        ctx.addIssue({ code: 'custom', path: [index, 'availableQty'], message: 'Số lượng cung ứng phải bằng 0 khi hết hàng' });
      }
    });
  }).optional(),
  action: z.enum(['save', 'submit']).default('save'),
});

async function assertOwnership(supabase: Awaited<ReturnType<typeof supabaseServer>>, productId: string, partnerId: string) {
  const { data, error } = await supabase.from('products').select('id, partner_id, status').eq('id', productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.partner_id !== partnerId) {
    const { forbidden, notFound } = await import('@/lib/errors');
    throw data ? forbidden('Sản phẩm không thuộc doanh nghiệp của bạn') : notFound('Không tìm thấy sản phẩm');
  }
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const body = patchSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: body.error.issues.map((i) => i.message).join('; ') } }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const product = await assertOwnership(supabase, id, user.id);
    const d = body.data;

    if (d.images !== undefined || d.variants !== undefined) {
      if (!d.name || !d.slug || !d.categoryId || !d.price || !d.images || !d.variants || d.action !== 'submit') {
        return NextResponse.json({ error: { code: 'VALIDATION', message: 'Vui lòng điền đầy đủ thông tin sản phẩm.' } }, { status: 400 });
      }
      const labels = d.variants.map(v => v.label.toLocaleLowerCase('vi'));
      const ids = d.variants.flatMap(v => v.id ? [v.id] : []);
      if (new Set(labels).size !== labels.length || new Set(ids).size !== ids.length) {
        return NextResponse.json({ error: { code: 'VALIDATION', message: 'Các biến thể không được trùng nhau.' } }, { status: 400 });
      }
      const { error } = await supabaseAdmin().rpc('partner_resubmit_product', { p_product: id, p_partner: user.id, p_data: d });
      if (error?.code === 'PGRST202') {
        return NextResponse.json({ error: {
          code: 'RESUBMISSION_NOT_CONFIGURED',
          message: 'Chức năng gửi duyệt lại chưa được cập nhật trên cơ sở dữ liệu. Vui lòng liên hệ quản trị viên; thông tin đã nhập vẫn được giữ trên form.',
        } }, { status: 503 });
      }
      if (error?.code === '23503') {
        return NextResponse.json({ error: { code: 'VARIANT_IN_USE', message: 'Biến thể đang được sử dụng trong giỏ hàng nên không thể xóa. Bạn có thể sửa khối lượng hoặc giá của biến thể đó.' } }, { status: 409 });
      }
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id });
    }
    if (!['DRAFT', 'REJECTED'].includes(product.status)) {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Vui lòng mở “Sửa” để cập nhật đầy đủ thông tin và gửi duyệt lại sản phẩm.' } }, { status: 409 });
    }
    if (product.status === 'REJECTED' && d.action === 'submit') {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Vui lòng mở “Sửa và gửi lại” để bổ sung thông tin trước khi gửi duyệt.' } }, { status: 400 });
    }

    const productUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.name) productUpdate.name = d.name;
    if (d.shortDescription !== undefined) productUpdate.short_description = d.shortDescription;
    if (d.description !== undefined) productUpdate.description = d.description;
    if (d.price !== undefined) productUpdate.price = d.price;
    if (d.action === 'submit') productUpdate.status = 'PENDING';

    const { data: updated, error } = await supabase
      .from('products')
      .update(productUpdate)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('Không thể cập nhật sản phẩm');

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const supabase = await supabaseServer();
    await assertOwnership(supabase, id, user.id);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
