
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('PARTNER');

    const body = z
      .object({
        businessName: z.string().trim().min(2),
        businessLicenseNo: z.string().trim().min(5),
        address: z.string().trim().min(5),
        contactEmail: z.string().trim().email(),
        contactPhone: z.string().trim().min(8),
        note: z.string().optional(),
      })
      .safeParse(await req.json());

    if (!body.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: body.error.issues
              .map((i) => i.message)
              .join('; '),
          },
        },
        { status: 400 },
      );
    }

    const supabase = supabaseAdmin();
    const d = body.data;

    // Tạo hoặc cập nhật hồ sơ + đặt selling_status = PENDING
    const { data: profile, error: profileError } = await supabase
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
        {
          onConflict: 'user_id',
        },
      )
      .select('user_id')
      .single();

    if (profileError || !profile) {
      console.error('Saving partner profile failed:', JSON.stringify(profileError));
      const code = profileError?.code ?? 'NO_PROFILE';
      const explanation = code === '23505'
        ? 'Số giấy phép kinh doanh đã được sử dụng.'
        : code === '42501'
          ? 'Supabase từ chối quyền lưu hồ sơ doanh nghiệp (RLS).'
          : code === '23503'
            ? 'Tài khoản chưa có hồ sơ người dùng tương ứng trong dữ liệu ứng dụng.'
            : 'Cần kiểm tra chi tiết lỗi Supabase trong terminal chạy website.';
      return NextResponse.json({ error: { code: 'PROFILE_SAVE_FAILED', message: `Không lưu được hồ sơ doanh nghiệp. ${explanation} Mã lỗi: ${code}.` } }, { status: 500 });
    }

    const { data: app, error: applicationError } = await supabase
      .from('partner_applications')
      .insert({
        partner_id: user.id,
        note: d.note ?? '',
        status: 'PENDING',
      })
      .select('id')
      .single();

    if (applicationError || !app) {
      console.error('Submitting partner application failed:', applicationError);
      return NextResponse.json({ error: { code: 'APPLICATION_SAVE_FAILED', message: 'Đã lưu thông tin doanh nghiệp nhưng chưa gửi được hồ sơ duyệt. Vui lòng thử gửi lại; nếu vẫn lỗi, kiểm tra quyền bảng partner_applications.' } }, { status: 500 });
    }

    return NextResponse.json({ profileId: profile.user_id, applicationId: app.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const user = await requireRole('PARTNER');
    const supabase = await supabaseServer();

    const { data: profile, error: profileError } = await supabase
      .from('partner_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { data: applications, error: applicationsError } =
      await supabase
        .from('partner_applications')
        .select('*')
        .eq('partner_id', user.id)
        .order('created_at', { ascending: false });

    if (applicationsError) {
      throw new Error(applicationsError.message);
    }

    return NextResponse.json({
      profile: profile ?? null,
      applications: applications ?? [],
    });
  } catch (err) {
    return handleApiError(err);
  }
}
