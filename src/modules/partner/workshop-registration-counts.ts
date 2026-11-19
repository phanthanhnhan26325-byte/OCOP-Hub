import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Callers supply only session IDs from workshops owned by the authenticated partner.
export async function countPaidWorkshopRegistrations(sessionIds: string[]) {
  const counts = new Map<string, number>();
  if (!sessionIds.length) return counts;

  const admin = supabaseAdmin();
  const sessionsByRegistration = new Map<string, string>();
  for (let offset = 0; offset < sessionIds.length; offset += 100) {
    const batch = sessionIds.slice(offset, offset + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from('workshop_registrations')
        .select('id, session_id')
        .in('session_id', batch)
        .in('status', ['CONFIRMED', 'COMPLETED'])
        .order('id').range(from, from + 499);
      if (error) throw new Error(error.message);
      for (const registration of data) {
        sessionsByRegistration.set(registration.id, registration.session_id);
      }
      if (data.length < 500) break;
    }
  }

  const registrationIds = [...sessionsByRegistration.keys()];
  for (let offset = 0; offset < registrationIds.length; offset += 100) {
    const batch = registrationIds.slice(offset, offset + 100);
    // Multiple payment attempts can refer to a single registration.
    const paidIds = new Set<string>();
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from('payments')
        .select('reference_id')
        .eq('purpose', 'WORKSHOP_REGISTRATION')
        .eq('status', 'PAID')
        .eq('business_sync_status', 'SYNCED')
        .in('reference_id', batch)
        .order('id').range(from, from + 499);
      if (error) throw new Error(error.message);
      for (const payment of data) paidIds.add(payment.reference_id);
      if (data.length < 500) break;
    }

    for (const registrationId of paidIds) {
      const sessionId = sessionsByRegistration.get(registrationId)!;
      counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
    }
  }

  return counts;
}
