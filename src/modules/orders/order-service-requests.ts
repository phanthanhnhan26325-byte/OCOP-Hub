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

export function isWithinOrderReturnWindow(
  shipment: { delivered_at: string | null } | { delivered_at: string | null }[] | null,
  history: { to_status: string; created_at: string }[],
) {
  const deliveredAt = (Array.isArray(shipment) ? shipment[0] : shipment)?.delivered_at
    ?? history.filter(item => item.to_status === 'DELIVERED').map(item => item.created_at).sort()[0];
  return Boolean(deliveredAt && Date.now() < Date.parse(deliveredAt) + 72 * 60 * 60 * 1000);
}
