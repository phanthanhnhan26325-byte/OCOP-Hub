import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface FinanceEvent {
  ref_type: 'SUB_ORDER' | 'WORKSHOP_REGISTRATION' | 'REFUND' | 'WORKSHOP_REFUND';
  ref_id: string;
  sale_id: string;
  partner_id: string;
  recognized_at: string;
  gross: number;
  refund: number;
  fee: number;
}

export async function loadFinanceEvents(start: string | null, end: string, partnerId?: string) {
  const db = supabaseAdmin();
  const events: FinanceEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from('finance_recognition_events')
      .select('ref_type, ref_id, sale_id, partner_id, recognized_at, gross, refund, fee')
      .lt('recognized_at', end);
    if (start) query = query.gte('recognized_at', start);
    if (partnerId) query = query.eq('partner_id', partnerId);
    const { data, error } = await query.order('recognized_at').order('ref_type')
      .order('ref_id').order('sale_id').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    events.push(...data);
    if (data.length < 500) return events;
  }
}
