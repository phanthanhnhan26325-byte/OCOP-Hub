import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const categoryIdSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const parsedId = categoryIdSchema.safeParse(id);

    if (!parsedId.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Mã danh mục không hợp lệ.' } },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin().rpc('admin_delete_product_category', {
      p_admin: admin.id,
      p_category: parsedId.data,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
