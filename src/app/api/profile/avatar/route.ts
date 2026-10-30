import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const bucket = 'ocop-profile-avatars-v1';
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const formData = await request.formData();
    const avatar = formData.get('avatar');

    if (!(avatar instanceof File) || avatar.size === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn ảnh đại diện.' }, { status: 400 });
    }
    if (!extensions[avatar.type]) {
      return NextResponse.json({ error: 'Ảnh phải có định dạng JPG, PNG hoặc WebP.' }, { status: 400 });
    }
    if (avatar.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ảnh đại diện không được lớn hơn 5 MB.' }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const path = `${user.id}/${randomUUID()}.${extensions[avatar.type]}`;
    const { data: uploaded, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, avatar, { contentType: avatar.type, cacheControl: '31536000', upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from(bucket).getPublicUrl(uploaded.path);
    const { error: profileError } = await supabase
      .from('users')
      .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileError) throw new Error(profileError.message);

    return NextResponse.json({ ok: true, avatarUrl: data.publicUrl });
  } catch (error) {
    return handleApiError(error);
  }
}