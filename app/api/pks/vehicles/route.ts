import { NextResponse } from 'next/server';

const PKS_PANEL_VEHICLES_URL = 'http://185.214.67.112/api/its/vehicles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(PKS_PANEL_VEHICLES_URL, {
      headers: {
        Host: 'einfo.zgpks.rzeszow.pl',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { items: [], error: `PKS vehicles feed returned ${response.status}`, details: text.slice(0, 240) },
        { status: 502 },
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { items: [], error: error instanceof Error ? error.message : 'PKS vehicles feed unavailable' },
      { status: 502 },
    );
  }
}
