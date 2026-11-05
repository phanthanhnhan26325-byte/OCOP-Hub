import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  carrierName: z.string().trim().min(2).max(200),
  trackingNumber: z.string().trim().min(2).max(200),
  handedOverAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Thông tin vận chuyển không hợp lệ' } }, { status: 400 });
    }

    const { error } = await supabaseAdmin().rpc('admin_update_order_shipment', {
      p_admin: admin.id,
      p_order: id,
      p_carrier_name: body.data.carrierName,
      p_tracking_number: body.data.trackingNumber,
      p_handed_over_at: body.data.handedOverAt,
      p_delivered_at: body.data.deliveredAt,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
