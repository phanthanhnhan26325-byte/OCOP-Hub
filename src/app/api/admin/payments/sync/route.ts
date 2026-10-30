import { NextResponse } from 'next/server';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

/** Admin chủ động retry business sync cho các payment PAID nhưng PENDING_SYNC. */
export async function POST() {
  try {
    await requireRole('ADMIN');
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('sync_pending_payments');
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
