import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const referenceSchema = z.string().trim().min(3).max(200);
const bucket = 'ocop-settlement-payout-proofs-v1';
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['application/pdf', 'pdf'],
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null;
  let supabase: ReturnType<typeof supabaseAdmin> | null = null;
  try {
    const admin = await requireRole('ADMIN');
    supabase = supabaseAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã yêu cầu không hợp lệ.' } }, { status: 400 });
    }
    const formData = await request.formData();
    const parsedReference = referenceSchema.safeParse(formData.get('transferReference'));
    const file = formData.get('proof');
    if (!parsedReference.success || !(file instanceof File) || file.size === 0 || file.size > maxFileSize) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Cần mã giao dịch hợp lệ và chứng từ tối đa 5 MB.' } }, { status: 400 });
    }
    const extension = allowedTypes.get(file.type);
    if (!extension) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Chứng từ phải là JPG, PNG hoặc PDF.' } }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.type === 'application/pdf'
      && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
    const isPng = file.type === 'image/png'
      && bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isJpeg = file.type === 'image/jpeg'
      && bytes.length >= 3
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPdf && !isPng && !isJpeg) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Nội dung tệp không khớp định dạng chứng từ.' } }, { status: 400 });
    }

    const { data: requestRow, error: requestError } = await supabase
      .from('settlement_requests')
      .select('id, status')
      .eq('id', id)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (requestRow.status !== 'APPROVED') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Chỉ yêu cầu đã duyệt mới được ghi nhận chuyển khoản.' } }, { status: 409 });
    }

    const path = `${id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);
    uploadedPath = path;

    const { error } = await supabase.rpc('admin_record_settlement_request_payout', {
      p_admin: admin.id,
      p_request: id,
      p_ref_no: parsedReference.data,
      p_evidence_path: uploadedPath,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (uploadedPath && supabase) {
      const { data: linkedRequest, error: lookupError } = await supabase
        .from('settlement_requests')
        .select('proof_path')
        .eq('proof_path', uploadedPath)
        .maybeSingle();
      if (lookupError) {
        console.error('[settlement-payout-proof:verify-cleanup]', lookupError.message);
      } else if (!linkedRequest) {
        const { error: cleanupError } = await supabase.storage.from(bucket).remove([uploadedPath]);
        if (cleanupError) console.error('[settlement-payout-proof:cleanup]', cleanupError.message);
      }
    }
    return handleApiError(error);
  }
}
