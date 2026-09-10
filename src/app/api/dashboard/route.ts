import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/dashboard-data';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const data = await getDashboardData();
  return NextResponse.json(data);
}
