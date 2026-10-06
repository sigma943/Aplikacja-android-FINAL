import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  if (!/^(stop-point|stop-point-timetable\/\d+|its\/infoboard\/nearest-departures\/\d+)$/.test(endpoint))
    return NextResponse.json({error:'Unsupported endpoint'}, {status:400});
  const day = request.nextUrl.searchParams.get('day');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({error:'Invalid day'}, {status:400});
  try {
    const response = await fetch('http://einfo.zgpks.rzeszow.pl/api/' + endpoint + (day ? '?day='+day : ''), {cache:'no-store', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('PKS HTTP '+response.status);
    const data = await response.json();
    if (data.success === false) throw new Error('PKS rejected request');
    return NextResponse.json(data);
  } catch { return NextResponse.json({error:'PKS unavailable'}, {status:502}); }
}
