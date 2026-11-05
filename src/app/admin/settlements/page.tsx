import { redirect } from 'next/navigation';

export default function LegacySettlementsPage() {
  redirect('/admin/finance/reconciliation');
}
