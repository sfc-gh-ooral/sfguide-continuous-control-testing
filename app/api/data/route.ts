import { NextResponse } from 'next/server';
import type { CctData } from '@/lib/cct-data';
import { mockData } from '@/lib/mock-data';
import { isSnowflakeConfigured } from '@/lib/snowflake';

// One entry point for every screen. Uses Snowflake when .env.local is configured and the user hasn't
// switched to Sample (x-cct-mode: sample); otherwise the bundled synthetic data. Live failures are
// returned as errors, never silently replaced with sample data.
const OPS = new Set<keyof CctData>(['coverage', 'queue', 'exception', 'explain', 'dispose', 'backlog', 'triage', 'decide', 'evidence', 'recount']);

export async function POST(request: Request) {
  const { op, args } = await request.json();
  if (!OPS.has(op) || !Array.isArray(args) || args.length > 3) return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
  const wantSample = request.headers.get('x-cct-mode') === 'sample';
  const impl: CctData = isSnowflakeConfigured() && !wantSample ? (await import('@/lib/live-data')).liveData : mockData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (impl[op as keyof CctData] as (...a: any[]) => Promise<unknown>)(...args);
    return NextResponse.json(result ?? { notFound: true });
  } catch (error) {
    console.error(`${op} failed:`, error);
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 502 });
  }
}
