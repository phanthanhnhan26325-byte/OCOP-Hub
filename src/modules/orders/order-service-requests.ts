import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const ORDER_RETURN_EVIDENCE_BUCKET = 'ocop-order-return-evidence-v1';

export interface OrderServiceRequest {
  id: string;
  order_id: string;
  request_type: 'CANCELLATION' | 'RETURN';
  status: string;
  reason: string;
  evidence_path: string | null;
  evidence_url?: string | null;
  contact_phone: string | null;
  partner_response: string | null;
  refund_amount: number | string;
  refund_status: 'NOT_REQUIRED' | 'RESERVED' | 'PENDING' | 'COMPLETED' | 'FAILED';
  created_at: string;
  return_received_at?: string | null;
}

export async function withSignedOrderEvidence<T extends { evidence_path: string | null }>(requests: T[]) {
  if (requests.length === 0) return requests.map(request => ({ ...request, evidence_url: null }));
  const admin = supabaseAdmin();
  return Promise.all(requests.map(async request => {
    if (!request.evidence_path) return { ...request, evidence_url: null };
    const { data, error } = await admin.storage
      .from(ORDER_RETURN_EVIDENCE_BUCKET)
      .createSignedUrl(request.evidence_path, 60 * 60);
    if (error) throw new Error(`Could not create a signed order return image URL: ${error.message}`);
    return { ...request, evidence_url: data.signedUrl };
  }));
}
