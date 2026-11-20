'use client';

// Exception detail: the evidence row, the control logic that found it, the feed-quality results
// for that month, and an AI explanation with a suggested disposition for a person to accept or change.
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DispositionForm } from '@/components/DispositionForm';
import { Reasoning } from '@/components/Reasoning';
import { ErrorBox, Tag } from '@/components/Status';
import { Card, Markdown, PoweredBy, SampleAiBadge, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import type { AiResult } from '@/lib/types';

const fmt = (k: string, v: unknown) => v === null || v === undefined ? '—'
  : typeof v === 'number' && k.endsWith('_usd') ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);

function Detail() {
  const id = useSearchParams().get('id') ?? '';
  const [reload, setReload] = useState(0);
  const [ai, setAi] = useState<AiResult>();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const { data: d, error, loading } = useAsync(() => data.exception(id), [id, reload]);
  if (error) return <ErrorBox error={error} />;
  if (loading) return <Thinking label="Loading exception" />;
  if (!d) return <Card><p className="text-sm">Exception not found. <Link className="underline" href="/queue">Back to the queue</Link></p></Card>;
  const { exception: e, control: c, run } = d;

  const explain = async () => {
    setAiBusy(true); setAiError(undefined); setAi(undefined);
    try { setAi(await data.explain(e.exception_id)); } catch (err) { setAiError(String((err as Error).message)); } finally { setAiBusy(false); }
  };

  return (
    <div className="space-y-5 stagger">
      <div>
        <Link href="/queue" className="text-xs underline inline-flex items-center gap-1 muted"><ArrowLeft className="w-3 h-3" aria-hidden />Exception queue</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap mt-1">
          <div>
            <h1 className="page-title">{c.control_id} · {e.record_id}</h1>
            <p className="text-sm text-2 mt-1">{c.control_name} · {monthLabel(e.period_start)} · owner {c.owner_name} ({c.team})</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Tag tone={e.severity === 'High' ? 'bad' : 'warn'}>{e.severity}</Tag>
            {e.disposition ? <Tag tone="good">{e.disposition}</Tag> : <Tag>Open</Tag>}
            <SourceBadge p={d} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Evidence row">
          <table className="data-table"><tbody>
            {Object.entries(e.detail).map(([k, v]) => (
              <tr key={k}><td className="text-xs muted w-1/2">{k.replace(/_/g, ' ')}</td><td className="text-sm tabular" style={k === 'approver_2' && v === null ? { color: 'var(--negative)', fontWeight: 600 } : undefined}>{fmt(k, v)}</td></tr>
            ))}
          </tbody></table>
          <p className="text-xs muted mt-2">One of {d.clusterSize} exceptions in cluster <strong>{e.cluster_key}</strong> for this run.</p>
        </Card>

        <Card title="AI explanation" right={ai?.source === 'mock' ? <SampleAiBadge /> : ai ? <SourceBadge p={ai} /> : <PoweredBy>AI_COMPLETE</PoweredBy>}>
          {!ai && !aiBusy && (
            <div>
              <p className="text-sm text-2 mb-3">Get a plain-language explanation and a suggested disposition. You decide.</p>
              <button className="btn btn-ai" onClick={explain}><Sparkles className="w-4 h-4" aria-hidden />Explain this exception</button>
            </div>
          )}
          {aiBusy && <Reasoning kind="explain" />}
          {aiError && <p role="alert" className="text-sm" style={{ color: 'var(--negative)' }}>{aiError}</p>}
          {ai && (
            <div className="ai-panel">
              <div className="prose-ai text-sm"><Markdown text={ai.text} /></div>
              {ai.suggestion && <p className="text-sm mt-2">Suggested disposition: <Tag tone={ai.suggestion === 'True issue' ? 'bad' : ai.suggestion === 'Data issue' ? 'warn' : 'info'}>{ai.suggestion}</Tag></p>}
              <p className="text-[11px] muted mt-2">AI suggestion{ai.model ? ` from ${ai.model}` : ''}. A reviewer must confirm the disposition.</p>
            </div>
          )}
        </Card>
      </div>

      {!e.disposition && (
        <Card title="Disposition">
          {saved && <p className="text-sm mb-2" role="status" style={{ color: 'var(--positive)' }}>{saved}</p>}
          <DispositionForm key={ai?.suggestion ?? 'none'} ids={[e.exception_id]} initial={ai?.suggestion} onDone={(n) => { setSaved(`Saved ${n} disposition.`); setReload((r) => r + 1); }} />
        </Card>
      )}
      {e.disposition && (
        <Card title="Disposition">
          <p className="text-sm"><strong>{e.disposition}</strong> by {e.disposed_by}{e.disposed_ts ? ` on ${new Date(e.disposed_ts).toLocaleString()}` : ''}</p>
          <p className="text-sm text-2 mt-1">{e.disposition_note}</p>
        </Card>
      )}

      {d.feed.length > 0 && (
        <Card title={`Wire feed quality, ${monthLabel(e.period_start)}`} right={<PoweredBy>Data metric functions</PoweredBy>}>
          <p className="text-xs text-2 mb-2">Percent of wires over $250,000 that arrived with no second approver, per feed batch. Measured by the custom data metric function APPROVER_2_NULL_PCT.</p>
          <div className="h-44" role="img" aria-label={`Bar chart of approver_2 null percent by feed batch. ${d.feed.filter((f) => f.is_anomaly).map((f) => `${f.feed_batch_id} is ${f.metric_value}%`).join(', ') || 'No anomalies'}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.feed} margin={{ left: -18, right: 8 }}>
                <XAxis dataKey="feed_batch_id" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} unit="%" />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="metric_value" name="Null %" isAnimationActive={false}>
                  {d.feed.map((f) => <Cell key={f.feed_batch_id} fill={f.is_anomaly ? 'var(--warning)' : 'var(--chart-1)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="Control logic" right={run && <span className="text-[11px] muted">Query ID {run.query_id}</span>}>
        <p className="text-xs text-2 mb-2">Runs monthly over the full population. The two bind variables are the first and last day of the month.</p>
        <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre" style={{ background: 'var(--surface-2)' }}>{c.exception_sql}</pre>
        {run && <p className="text-xs muted mt-2">Run {run.run_id}: {run.population_count.toLocaleString()} records tested, {run.exception_count} exceptions, {new Date(run.run_ts).toLocaleString()}.</p>}
      </Card>
    </div>
  );
}

export default function ExceptionPage() {
  return <Suspense fallback={<Thinking label="Loading exception" />}><Detail /></Suspense>;
}
