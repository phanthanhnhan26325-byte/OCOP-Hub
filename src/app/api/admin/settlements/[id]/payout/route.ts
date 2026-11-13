import { NextResponse } from 'next/server';
import { handleApiError, requireRole } from '@/lib/rbac';

/** Disallow payouts that bypass partner request approval and transfer evidence. */
export async function POST() {
  try {
    await requireRole('ADMIN');
    return NextResponse.json({
      error: {
        code: 'SETTLEMENT_REQUEST_REQUIRED',
        message: 'Hãy duyệt yêu cầu của doanh nghiệp và ghi nhận chuyển khoản kèm chứng từ tại hàng đợi yêu cầu đối soát.',
      },
    }, { status: 409 });
  } catch (err) {
    return handleApiError(err);
  }
}
