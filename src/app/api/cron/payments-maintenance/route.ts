import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Cron: giải phóng hold khi payment hết hạn + retry business sync.
 * Gọi định kỳ (Vercel Cron hoặc node scheduler) với CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET ?? 'dev-cron-secret'}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const expired = await admin.rpc('expire_holds');
  const synced = await admin.rpc('sync_pending_payments');
  return NextResponse.json({ expired: expired.data, synced: synced.data });
}
