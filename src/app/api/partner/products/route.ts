import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const supplyStatusSchema = z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER']);

const productSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa a-z, 0-9, dấu gạch'),
  shortDescription: z.string().max(300).optional(),
  description: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string().uuid(),
  variants: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    price: z.number().positive(),
    availableQty: z.number().int().min(0).default(0),
    supplyStatus: supplyStatusSchema.default('OUT_OF_STOCK'),
    preOrderEta: z.union([z.string().date(), z.literal(''), z.null()]).optional(),
  })).default([]).superRefine((variants, ctx) => {
    const labels = variants.map((variant) => variant.label.toLocaleLowerCase('vi'));
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: 'custom', message: 'Khối lượng của các biến thể không được trùng nhau' });
    }
    variants.forEach((variant, index) => {
      if (variant.supplyStatus === 'PRE_ORDER' && !variant.preOrderEta) {
        ctx.addIssue({ code: 'custom', path: [index, 'preOrderEta'], message: 'Vui lòng chọn ngày dự kiến có hàng khi nhận đặt trước' });
      }
      if (variant.supplyStatus === 'OUT_OF_STOCK' && variant.availableQty !== 0) {
        ctx.addIssue({ code: 'custom', path: [index, 'availableQty'], message: 'Số lượng cung ứng phải bằng 0 khi hết hàng' });
      }
    });
  }),
  ocopCertNo: z.string().optional(),
  images: z.array(z.string().url()).min(1, 'Vui lòng tải lên ít nhất 1 ảnh sản phẩm').max(10, 'Chỉ được tải tối đa 10 ảnh'),
});

export async function GET() {
  try {
    const user = await requireApprovedPartner();
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('products')
      .select('*, product_categories(name), product_images(url, sort_order), product_availability(*), product_variants(id, label, price, product_variant_availability(available_qty, supply_status, pre_order_eta))')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ products: data });
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
    const { data: category, error: categoryError } = await supabase
      .from('product_categories')
      .select('id')
      .eq('id', d.categoryId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (categoryError) throw new Error(categoryError.message);
    if (!category) {
      return NextResponse.json(
        { error: { code: 'INVALID_CATEGORY', message: 'Vui lòng chọn danh mục sản phẩm hợp lệ' } },
        { status: 400 },
      );
    }
    const { data: conflictingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('slug', d.slug)
      .maybeSingle();
    if (conflictingProduct) {
      return NextResponse.json(
        { error: { code: 'SLUG_TAKEN', message: 'Slug sản phẩm đã tồn tại. Nếu sản phẩm này đã có trong danh sách, hãy bấm “Sửa” để gửi duyệt lại; nếu không, hãy đổi tên hoặc slug.' } },
        { status: 409 },
      );
    }
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        partner_id: user.id,
        category_id: d.categoryId,
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
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: { code: 'SLUG_TAKEN', message: 'Slug sản phẩm đã tồn tại. Nếu sản phẩm này đã có trong danh sách, hãy bấm “Sửa” để gửi duyệt lại; nếu không, hãy đổi tên hoặc slug.' } },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    const adminClient = supabaseAdmin();
    const { error: availabilityError } = await adminClient.from('product_availability').insert({
      product_id: product.id,
      available_qty: 0,
      reserved_qty: 0,
      supply_status: 'OUT_OF_STOCK',
      updated_by: user.id,
    });
    if (availabilityError) {
      const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id);
      if (cleanupError) {
        throw new Error(`${availabilityError.message}; không thể hoàn tác sản phẩm: ${cleanupError.message}`);
      }
      throw new Error(availabilityError.message);
    }
    if (d.images.length) {
      const { error: imageError } = await supabase.from('product_images').insert(
        d.images.map((url, i) => ({ product_id: product.id, url, sort_order: i })),
      );
      if (imageError) {
        const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id);
        if (cleanupError) {
          throw new Error(`${imageError.message}; không thể hoàn tác sản phẩm: ${cleanupError.message}`);
        }
        throw new Error(imageError.message);
      }
    }
    if (d.variants.length) {
      const { data: createdVariants, error: variantsError } = await supabase.from('product_variants').insert(
        d.variants.map((variant) => ({
          product_id: product.id,
          label: variant.label,
          price: variant.price,
        })),
      ).select('id, label');
      if (variantsError) {
        const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id);
        if (cleanupError) {
          throw new Error(`${variantsError.message}; không thể hoàn tác sản phẩm: ${cleanupError.message}`);
        }
        throw new Error(variantsError.message);
      }

      const availabilityRows = d.variants.flatMap((variant) => {
        const created = createdVariants?.find((item) => item.label.toLocaleLowerCase('vi') === variant.label.toLocaleLowerCase('vi'));
        if (!created) return [];
        return [{
          variant_id: created.id,
          product_id: product.id,
          available_qty: variant.availableQty,
          supply_status: variant.supplyStatus,
          pre_order_eta: variant.supplyStatus === 'PRE_ORDER' ? variant.preOrderEta || null : null,
          updated_by: user.id,
        }];
      });
      if (availabilityRows.length) {
        const { error: variantAvailabilityError } = await adminClient.from('product_variant_availability').insert(availabilityRows);
        if (variantAvailabilityError) {
          const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id);
          if (cleanupError) {
            throw new Error(`${variantAvailabilityError.message}; không thể hoàn tác sản phẩm: ${cleanupError.message}`);
          }
          throw new Error(variantAvailabilityError.message);
        }
      }
    }
    const { error: submitError } = await supabase
      .from('products')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .eq('status', 'DRAFT')
      .select('id')
      .single();
    if (submitError) {
      const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id);
      if (cleanupError) {
        throw new Error(`${submitError.message}; không thể hoàn tác sản phẩm: ${cleanupError.message}`);
      }
      throw new Error(submitError.message);
    }
    return NextResponse.json({ id: product.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
