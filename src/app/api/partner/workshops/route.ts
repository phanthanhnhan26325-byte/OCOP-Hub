import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const sessionSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  location: z.string().min(3),
  fee: z.number().min(0),
  capacity: z.number().int().min(1),
});

const workshopSchema = z.object({
  title: z.string().min(5),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  coverImage: z.string().url().optional(),
  action: z.enum(['save', 'submit']).default('save'),
  sessions: z.array(sessionSchema).min(1),
});

export async function GET() {
  try {
    const user = await requireApprovedPartner();
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('workshops')
      .select('*, workshop_sessions(*)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false });
    return NextResponse.json({ workshops: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApprovedPartner();
    const body = workshopSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: body.error.issues.map((i) => i.message).join('; ') } }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const d = body.data;
    const { data: ws, error } = await supabase
      .from('workshops')
      .insert({
        partner_id: user.id,
        title: d.title,
        slug: d.slug,
        description: d.description ?? '',
        cover_image: d.coverImage ?? null,
        status: d.action === 'submit' ? 'PENDING' : 'DRAFT',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    await supabase.from('workshop_sessions').insert(
      d.sessions.map((s) => ({
        workshop_id: ws.id,
        starts_at: s.startsAt,
        ends_at: s.endsAt,
        location: s.location,
        fee: s.fee,
        capacity: s.capacity,
        remaining_seats: s.capacity,
        status: 'SCHEDULED',
      })),
    );
    return NextResponse.json({ id: ws.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
