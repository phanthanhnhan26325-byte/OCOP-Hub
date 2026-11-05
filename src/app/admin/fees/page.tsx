import { redirect } from 'next/navigation';

export default function LegacyFeesPage() {
  redirect('/admin/finance/settings');
}
