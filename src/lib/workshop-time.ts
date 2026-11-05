/** Display workshop times consistently in Vietnam, including AM/PM. */
export function formatWorkshopTime(startsAt: string, endsAt: string) {
  const options = { timeZone: 'Asia/Ho_Chi_Minh' };
  const clock = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      ...options, hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(new Date(iso));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return { time: `${part('hour')}h${part('minute') === '00' ? '' : part('minute')}`, period: part('dayPeriod') };
  };
  const start = clock(startsAt);
  const end = clock(endsAt);
  const startDate = new Date(startsAt).toLocaleDateString('vi-VN', options);
  const endDate = new Date(endsAt).toLocaleDateString('vi-VN', options);
  if (startDate !== endDate) {
    return `${start.time} ${start.period} ${startDate} – ${end.time} ${end.period} ${endDate}`;
  }
  return `${start.time}${start.period === end.period ? '' : ` ${start.period}`}–${end.time} ${end.period} · ${startDate}`;
}
