import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const itemSchema = z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(99) });

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
    const { data: items } = await supabase
      .from('cart_items')
      .select('id, qty, product_id, products(id, name, slug, price, partner_id, product_images(url, sort_order), product_availability(available_qty, reserved_qty, supply_status), partner_profiles(business_name))')
      .eq('cart_id', cartId);
    return NextResponse.json({ items: items ?? [] });
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

    const { data: product } = await supabase
      .from('products')
      .select('id, status')
      .eq('id', body.data.productId)
      .single();
    if (!product || product.status !== 'APPROVED') {
      return NextResponse.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Sản phẩm không khả dụng' } }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, qty')
      .eq('cart_id', cartId)
      .eq('product_id', body.data.productId)
      .maybeSingle();
    if (existing) {
      await supabase.from('cart_items').update({ qty: existing.qty + body.data.qty }).eq('id', existing.id);
    } else {
      await supabase.from('cart_items').insert({ cart_id: cartId, product_id: body.data.productId, qty: body.data.qty });
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
