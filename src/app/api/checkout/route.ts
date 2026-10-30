import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { checkout, checkoutInputSchema } from '@/modules/orders/checkout.service';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = checkoutInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map((i) => i.message).join('; ') } }, { status: 400 });
    }
    const result = await checkout(parsed.data);
    return NextResponse.json(result, { status: result.duplicated ? 200 : 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
