import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join('; ') } },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin().rpc('admin_save_product_category', {
      p_admin: admin.id,
      p_category: parsed.data.id ?? null,
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_status: parsed.data.status,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
