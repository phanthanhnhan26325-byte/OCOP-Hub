import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const productSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa a-z, 0-9, dấu gạch'),
  shortDescription: z.string().max(300).optional(),
  description: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string().uuid().optional().nullable(),
  ocopCertNo: z.string().optional(),
  images: z.array(z.string().url()).max(8).default([]),
  availableQty: z.number().int().min(0),
  supplyStatus: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER']).default('IN_STOCK'),
  preOrderEta: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireApprovedPartner();
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('products')
      .select('*, product_images(url, sort_order), product_availability(*)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApprovedPartner();
    const body = productSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: body.error.issues.map((i) => i.message).join('; ') } },
        { status: 400 },
      );
    }
    const supabase = await supabaseServer();
    const d = body.data;
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        partner_id: user.id,
        category_id: d.categoryId ?? null,
        name: d.name,
        slug: d.slug,
        short_description: d.shortDescription ?? '',
        description: d.description ?? '',
        price: d.price,
        ocop_cert_no: d.ocopCertNo ?? null,
        status: 'DRAFT',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    await supabase.from('product_availability').insert({
      product_id: product.id,
      available_qty: d.availableQty,
      supply_status: d.supplyStatus,
      pre_order_eta: d.preOrderEta ?? null,
      updated_by: user.id,
    });
    if (d.images.length) {
      await supabase.from('product_images').insert(
        d.images.map((url, i) => ({ product_id: product.id, url, sort_order: i })),
      );
    }
    return NextResponse.json({ id: product.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
