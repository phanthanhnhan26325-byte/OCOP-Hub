import type { CSSProperties } from 'react';

export type PartnerIconName = 'overview' | 'bag' | 'box' | 'calendar' | 'wallet' | 'building' | 'plus' | 'chevron' | 'check' | 'alert';
const paths: Record<PartnerIconName, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  bag: 'M5 7h14l1 14H4L5 7z M9 7V5a3 3 0 0 1 6 0v2',
  box: 'M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z M3 7.5l9 5 9-5 M12 12.5V21 M7.5 5.3l9 4.5',
  calendar: 'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16',
  wallet: 'M3 5h17v15H3z M3 5V3h14v2 M15 11h6v5h-6z M17 13.5h1',
  building: 'M5 21V3h14v18 M2 21h20 M9 7h1 M14 7h1 M9 11h1 M14 11h1 M10 21v-6h4v6',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  alert: 'M12 8v5 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
export function PartnerIcon({ name, className = '', style }: { name: PartnerIconName; className?: string; style?: CSSProperties }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 shrink-0 ${className}`} style={style}><path d={paths[name]} /></svg>;
}
