import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const patchSchema = z.object({
  name: z.string().min(3).optional(),
  shortDescription: z.string().max(300).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  action: z.enum(['save', 'submit']).default('save'),
});

async function assertOwnership(supabase: Awaited<ReturnType<typeof supabaseServer>>, productId: string, partnerId: string) {
  const { data, error } = await supabase.from('products').select('id, partner_id').eq('id', productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.partner_id !== partnerId) {
    const { forbidden, notFound } = await import('@/lib/errors');
    throw data ? forbidden('Sản phẩm không thuộc doanh nghiệp của bạn') : notFound('Không tìm thấy sản phẩm');
  }
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
    await assertOwnership(supabase, id, user.id);
    const d = body.data;

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
