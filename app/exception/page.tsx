'use client';

// Exception detail: the evidence row, the control logic as run, the wire feed's data-quality
// measurements, an AI explanation with a suggested disposition, and the reviewer's decision.
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiCard } from '@/components/AiPanel';
import { useCoverage } from '@/components/Shell';
import { ChartTip, Empty, ErrorState, PageSkeleton, Pill, PoweredBy, Severity, Sheet, Source, SqlBlock, Stamp, dispositionTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import { DISPOSITIONS, type AiResult, type Disposition } from '@/lib/types';

const fmt = (k: string, v: unknown) => v === null || v === undefined ? <span className="text-pen font-semibold">null</span>
  : typeof v === 'boolean' ? <span className={v ? 'text-tick' : 'text-pen font-semibold'}>{String(v)}</span>
  : k.endsWith('_usd') ? usd(v) : String(v);

function Decide({ id, suggestion, onDone }: { id: string; suggestion?: Disposition; onDone: (d: Disposition, note: string) => void }) {
  const [d, setD] = useState<Disposition | undefined>(suggestion);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string>();
  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Disposition">
        {DISPOSITIONS.map((x) => (
          <button key={x} role="radio" aria-checked={d === x} onClick={() => setD(x)}
            className={`px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors ${d === x ? `bg-${dispositionTone(x)} text-on-ink border-transparent` : 'border-rule hover:border-ink'}`}>
            {x}{suggestion === x && <span className="font-normal opacity-80"> · AI suggestion</span>}</button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} aria-label="Reviewer note (required)"
        placeholder="Reviewer note (required). For example: confirmed against the payments audit log; feed reload requested."
        className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] focus:border-ink outline-none" />
      <div className="flex items-center gap-2">
        <button className="btn btn-ink" disabled={!d || !note.trim() || busy} onClick={async () => {
          setBusy(true); setErr(undefined);
          try { await data.dispose([id], d!, note.trim()); onDone(d!, note.trim()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? 'Recording…' : 'Record disposition'}</button>
        <span className="text-[11.5px] text-muted">A person decides. The AI suggestion is only pre-selected.</span>
      </div>
      {err && <p role="alert" className="text-[12px] text-pen">{err}</p>}
    </div>
  );
}

function Inner() {
  const id = useSearchParams().get('id') ?? '';
  const { reload: reloadCoverage } = useCoverage();
  const x = useAsync(() => data.exception(id), [id]);
  const [ai, setAi] = useState<AiResult>(); const [busy, setBusy] = useState(false); const [aiErr, setAiErr] = useState<string>();
  const [decided, setDecided] = useState<{ d: Disposition; note: string }>();
  if (x.error) return <ErrorState error={x.error} retry={x.reload} />;
  if (x.loading) return <PageSkeleton />;
  if (!x.data) return <Empty title="Exception not found"><Link className="underline" href="/queue">Back to the queue</Link></Empty>;
  const { exception: e, control: c, run, feed, clusterSize } = x.data;
  const d = e.detail as Record<string, unknown>;
  const disposition = decided?.d ?? (e.disposition as Disposition | null | undefined);
  const explain = async () => { setBusy(true); setAiErr(undefined); try { setAi(await data.explain(e.exception_id)); } catch (err) { setAiErr((err as Error).message); } finally { setBusy(false); } };
  const wire = c.source_table === 'SRC.WIRE_PAYMENTS';
  const feedBars = feed.map((f) => ({ batch: f.feed_batch_id.slice(-2), id: f.feed_batch_id, 'Null %': f.metric_value, anomaly: f.is_anomaly, base: f.baseline_value }));
  const steps = [`Reading evidence row ${e.record_id}…`, `Retrieving the ${c.control_id} test procedure…`, wire ? `Checking ${feed.length} feed batches for ${monthLabel(e.period_start)}…` : 'Checking source data quality…', 'Drafting explanation and disposition…'];

  return (
    <div className="space-y-5">
      <div className="rise">
        <Link href="/queue" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"><ArrowLeft className="w-3.5 h-3.5" aria-hidden />Exception queue</Link>
        <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
          <div className="min-w-0">
            <div className="eyebrow">{c.control_id} · {c.control_name}</div>
            <h1 className="cond text-[26px] leading-tight mt-0.5 break-words">Exception <span className="font-mono">{e.record_id}</span></h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[12.5px]">
              <Severity s={e.severity} /><Pill>{monthLabel(e.period_start)}</Pill><Pill>Cluster {e.cluster_key} · {clusterSize}</Pill>
              {disposition ? <Stamp d={disposition} /> : <Pill tone="pen">Open</Pill>}
            </div>
          </div>
          <Source p={x.data} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <Sheet eyebrow="Evidence" title="The record that failed" className="rise">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-[13px]">
              {Object.entries(d).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-rule min-w-0">
                  <dt className="text-muted font-mono text-[12px]">{k}</dt><dd className="num text-right break-all">{fmt(k, v)}</dd>
                </div>
              ))}
            </dl>
          </Sheet>
          {wire && feed.length > 0 && (
            <Sheet eyebrow={`Wire feed · ${monthLabel(e.period_start)}`} title="Second approver missing, by feed batch" right={<PoweredBy>Data metric functions</PoweredBy>} className="rise">
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <BarChart data={feedBars} margin={{ left: -12, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="id" tickLine={false} axisLine={false} tickFormatter={(v: string) => `…${v.slice(-6)}`} />
                    <YAxis unit="%" tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} />
                    {feedBars[0]?.base !== null && <ReferenceLine y={Number(feedBars[0]?.base)} stroke="var(--muted)" strokeDasharray="4 3" label={{ value: 'baseline', position: 'insideTopRight', fontSize: 11 }} />}
                    <Bar dataKey="Null %" radius={[3, 3, 0, 0]} barSize={36}>{feedBars.map((b) => <Cell key={b.id} fill={b.anomaly ? 'var(--feed)' : 'var(--muted)'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[12px] text-muted">A custom data metric function, <span className="font-mono">APPROVER_2_NULL_PCT</span>, measures each batch when the test runs. A batch more than five times its trailing baseline is flagged.</p>
            </Sheet>
          )}
          <Sheet eyebrow="Control logic" title="The test as it ran" right={run && <span className="text-[11px] text-muted font-mono break-all">query {run.query_id}</span>} className="rise">
            {c.exception_sql ? <SqlBlock sql={c.exception_sql.trim()} className="max-h-[300px]" /> : <p className="text-muted">Manual control; no automated test.</p>}
            <p className="text-[11.5px] text-muted mt-2">Run {run ? new Date(run.run_ts).toLocaleString() : ''} by a scheduled stored procedure over {run?.population_count.toLocaleString()} records. Bind variables are the period start and end.</p>
          </Sheet>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <AiCard title="Explain this exception" busy={busy} result={ai} text={ai?.text} steps={steps} powered={<PoweredBy>Cortex AI_COMPLETE</PoweredBy>}
            sources={[{ label: `Procedure P-${c.control_id}`, detail: 'CTRL.CONTROL_PROCEDURES' }, { label: `Evidence row ${e.record_id}` }, ...(wire ? [{ label: `FEED_QUALITY ${monthLabel(e.period_start)}` }] : [])]}
            idle={<div className="space-y-3"><p className="text-[13px] text-muted">Reads the evidence row, the control procedure and the month&apos;s feed quality, then explains why the record failed and suggests a disposition.</p>
              <button className="btn btn-ink" onClick={explain}><Sparkles className="w-4 h-4" aria-hidden />Explain</button>
              {aiErr && <p role="alert" className="text-[12px] text-pen">{aiErr}</p>}</div>}
            footer={ai?.suggestion && <div className="flex items-center gap-2 text-[13px]">Suggested disposition <Stamp d={ai.suggestion} /></div>} />
          <Sheet eyebrow="Human in the loop" title={disposition ? 'Disposition recorded' : 'Your decision'} className="rise">
            {disposition ? (
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2"><Stamp d={disposition} /><span className="text-muted">by {decided ? 'you' : e.disposed_by}</span></div>
                <p className="border-l-2 border-rule pl-3">{decided?.note ?? e.disposition_note}</p>
                <Link className="btn btn-sm" href={`/evidence?period=${e.period_start}`}>See it in the evidence pack</Link>
              </div>
            ) : <Decide key={ai?.suggestion ?? 'none'} id={e.exception_id} suggestion={ai?.suggestion} onDone={(dd, note) => { setDecided({ d: dd, note }); reloadCoverage(); }} />}
          </Sheet>
        </div>
      </div>
    </div>
  );
}

export default function ExceptionPage() { return <Suspense fallback={<PageSkeleton />}><Inner /></Suspense>; }
