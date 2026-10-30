import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('PARTNER');
    const body = z
      .object({
        businessName: z.string().min(2),
        businessLicenseNo: z.string().min(5),
        address: z.string().min(5),
        contactEmail: z.string().email(),
        contactPhone: z.string().min(8),
        note: z.string().optional(),
      })
      .safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: body.error.issues.map((i) => i.message).join('; ') } }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const d = body.data;

    // Tạo hoặc cập nhật hồ sơ + đặt selling_status = PENDING
    const { data: profile } = await supabase
      .from('partner_profiles')
      .upsert(
        {
          user_id: user.id,
          business_name: d.businessName,
          business_license_no: d.businessLicenseNo,
          address: d.address,
          contact_email: d.contactEmail,
          contact_phone: d.contactPhone,
          selling_status: 'PENDING',
        },
        { onConflict: 'user_id' },
      )
      .select('user_id')
      .single();

    const { data: app } = await supabase
      .from('partner_applications')
      .insert({
        partner_id: user.id,
        note: d.note ?? '',
        status: 'PENDING',
      })
      .select('id')
      .single();

    return NextResponse.json({ profileId: profile?.user_id, applicationId: app?.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const user = await requireRole('PARTNER');
    const supabase = await supabaseServer();
    const { data: profile } = await supabase.from('partner_profiles').select('*').eq('user_id', user.id).maybeSingle();
    const { data: applications } = await supabase
      .from('partner_applications')
      .select('*')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    return NextResponse.json({ profile: profile ?? null, applications: applications ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
