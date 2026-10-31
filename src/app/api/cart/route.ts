import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  qty: z.number().int().min(1).max(99),
});

async function getOrCreateCart(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string) {
  const { data } = await supabase.from('carts').select('id').eq('customer_id', userId).maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase
    .from('carts')
    .insert({ customer_id: userId })
    .select('id')
    .single();
  return created!.id;
}

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = await supabaseServer();
    const cartId = await getOrCreateCart(supabase, user.id);
    const { data: items, error } = await supabase
      .from('cart_items')
      .select('id, qty, product_id, variant_id, product_variants(id, label, price), products(id, name, slug, price, partner_id, product_images(url, sort_order), product_availability(available_qty, reserved_qty, supply_status), partner_profiles(business_name))')
      .eq('cart_id', cartId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ items });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = itemSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Dữ liệu không hợp lệ' } }, { status: 400 });
    const supabase = await supabaseServer();
    const cartId = await getOrCreateCart(supabase, user.id);

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, status')
      .eq('id', body.data.productId)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product || product.status !== 'APPROVED') {
      return NextResponse.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Sản phẩm không khả dụng' } }, { status: 404 });
    }

    const { data: variants, error: variantsError } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', product.id);
    if (variantsError) throw new Error(variantsError.message);
    if (variants.length > 0 && !body.data.variantId) {
      return NextResponse.json({ error: { code: 'PRODUCT_VARIANT_REQUIRED', message: 'Vui lòng chọn khối lượng sản phẩm' } }, { status: 400 });
    }

    if (body.data.variantId && !variants.some((variant) => variant.id === body.data.variantId)) {
      return NextResponse.json({ error: { code: 'INVALID_PRODUCT_VARIANT', message: 'Biến thể sản phẩm không hợp lệ' } }, { status: 400 });
    }

    let existingQuery = supabase
      .from('cart_items')
      .select('id, qty')
      .eq('cart_id', cartId)
      .eq('product_id', body.data.productId);
    existingQuery = body.data.variantId
      ? existingQuery.eq('variant_id', body.data.variantId)
      : existingQuery.is('variant_id', null);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      const { error } = await supabase
        .from('cart_items')
        .update({ qty: existing.qty + body.data.qty })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('cart_items').insert({
        cart_id: cartId,
        product_id: body.data.productId,
        variant_id: body.data.variantId ?? null,
        qty: body.data.qty,
      });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();
    const body = z.object({ itemId: z.string().uuid(), qty: z.number().int().min(1).max(99) }).safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from('cart_items')
      .update({ qty: body.data.qty })
      .eq('id', body.data.itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
    const itemId = new URL(req.url).searchParams.get('itemId');
    if (!itemId) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();
    await supabase.from('cart_items').delete().eq('id', itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
