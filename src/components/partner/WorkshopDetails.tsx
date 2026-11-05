import Link from 'next/link';
import type { PartnerWorkshop } from '@/modules/partner/workshop-list';

export function WorkshopDetails({ workshop }: { workshop: PartnerWorkshop }) {
  return <Link href={`/partner/workshops/${workshop.id}`} className="rounded-lg border border-[#cdded5] px-3 py-1.5 text-xs font-medium text-[#195c46] hover:bg-[#eaf4ee]">Chi tiết</Link>;
}