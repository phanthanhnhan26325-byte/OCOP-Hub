import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ORDER_RETURN_EVIDENCE_BUCKET } from '@/modules/orders/order-service-requests';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  contactPhone: z.string().trim().min(8).max(24).regex(/^[0-9+(). -]+$/),
});

function isSupportedImage(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null;
  let admin: ReturnType<typeof supabaseAdmin> | null = null;
  try {
    const user = await requireRole('CUSTOMER');
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã đơn hàng không hợp lệ.' } }, { status: 400 });
    }

    const formData = await req.formData();
    const parsed = bodySchema.safeParse({
      reason: formData.get('reason'),
      contactPhone: formData.get('contactPhone'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map(issue => issue.message).join('; ') } }, { status: 400 });
    }
    const image = formData.get('image');
    if (!(image instanceof File) || image.size === 0 || image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Vui lòng đính kèm một ảnh JPG hoặc PNG tối đa 5 MB.' } }, { status: 400 });
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!isSupportedImage(bytes, image.type)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Ảnh phải đúng định dạng JPG hoặc PNG.' } }, { status: 400 });
    }

    const extension = image.type === 'image/png' ? 'png' : 'jpg';
    uploadedPath = `${user.id}/${id}/${randomUUID()}.${extension}`;
    admin = supabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from(ORDER_RETURN_EVIDENCE_BUCKET)
      .upload(uploadedPath, bytes, { contentType: image.type, upsert: false });
    if (uploadError) throw new Error(`Không thể tải ảnh yêu cầu trả hàng: ${uploadError.message}`);

    const { data, error } = await admin.rpc('customer_update_order', {
      p_customer: user.id,
      p_order: id,
      p_action: 'REQUEST_RETURN',
      p_reason: parsed.data.reason,
      p_evidence_path: uploadedPath,
      p_contact_phone: parsed.data.contactPhone,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (uploadedPath && admin) {
      try {
        const { error: cleanupError } = await admin.storage
          .from(ORDER_RETURN_EVIDENCE_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) console.error('Cleaning up an unused order return image failed:', { uploadedPath, error: cleanupError });
      } catch (cleanupError) {
        console.error('Cleaning up an unused order return image failed:', { uploadedPath, error: cleanupError });
      }
    }
    return handleApiError(error);
  }
}
