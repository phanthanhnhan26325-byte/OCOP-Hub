export const workshopStatuses: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối', CANCELLED: 'Đã hủy',
};

export const sessionStatuses: Record<string, string> = {
  SCHEDULED: 'Đã lên lịch', OPEN: 'Đang mở đăng ký', CLOSED: 'Đã đóng đăng ký', COMPLETED: 'Đã hoàn thành', CANCELLED: 'Đã hủy',
};

export interface PartnerWorkshopSession {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string;
  fee: number | string;
  capacity: number;
  remaining_seats: number;
  status: string;
  workshop_registrations: { id: string; status: string }[];
}

export interface PartnerWorkshop {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: string;
  reject_reason: string | null;
  workshop_sessions: PartnerWorkshopSession[];
}

export function workshopStatusTone(status: string) {
  if (status === 'APPROVED') return 'bg-[#eaf4ee] text-[#195c46]';
  if (status === 'PENDING') return 'bg-[#fcf3d9] text-[#9b7418]';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'bg-[#fae9e7] text-[#cc4943]';
  return 'bg-slate-100 text-slate-600';
}

export function nextWorkshopSession(workshop: PartnerWorkshop, now: Date) {
  return workshop.workshop_sessions.filter(session => ['SCHEDULED', 'OPEN'].includes(session.status) && new Date(session.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
}

export function workshopDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
