'use client';

// Evidence pack: one snapshot per monthly run (query ID, records tested, exceptions, run time,
// reviewers) with a Time Travel recount, exportable as CSV or PDF (browser print).
import { Download, History, Printer } from 'lucide-react';
import { useState } from 'react';
import { ErrorBox, Tag } from '@/components/Status';
import { Card, PoweredBy, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import type { EvidenceRun, Recount } from '@/lib/types';

function csv(runs: EvidenceRun[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['run_id', 'control_id', 'control_name', 'period_start', 'records_tested', 'exceptions', 'query_id', 'run_ts', 'run_by', 'trigger', 'dispositions'];
  return [head.join(','), ...runs.map((r) => [r.run_id, r.control_id, r.control_name, r.period_start, r.population_count, r.exception_count, r.query_id, r.run_ts, r.run_by, r.trigger_type,
    r.dispositions.map((d) => `${d.disposition}: ${d.count}${d.reviewers.length ? ` (${d.reviewers.join('; ')})` : ''}`).join(' | ')].map(esc).join(','))].join('\n');
}

function RecountButton({ run }: { run: EvidenceRun }) {
  const [r, setR] = useState<Recount>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  if (r) return <span className="text-xs" title={r.sql}><strong className="tabular">{r.rows.toLocaleString()}</strong> rows in {r.table} at run time{r.queryId ? ` · query ${r.queryId}` : ' · sample'}</span>;
  return (
    <span className="no-print">
      <button className="btn !py-1 !text-xs" disabled={busy} onClick={async () => { setBusy(true); try { setR(await data.recount(run.run_id)); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); } }}>
        <History className="w-3.5 h-3.5" aria-hidden />{busy ? 'Recounting…' : 'Recount as of run'}
      </button>
      {err && <span role="alert" className="text-xs ml-1" style={{ color: 'var(--negative)' }}>{err}</span>}
    </span>
  );
}

export default function EvidencePage() {
  const [period, setPeriod] = useState<string>();
  const { data: ev, error, loading } = useAsync(() => data.evidence(period), [period]);
  if (error) return <ErrorBox error={error} />;
  if (loading || !ev) return <Thinking label="Loading evidence" />;
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(ev.runs)], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `evidence-${ev.period}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };
  const anomalies = ev.feed.filter((f) => f.is_anomaly);

  return (
    <div className="space-y-5 stagger">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Evidence pack</h1>
          <p className="text-sm text-2 mt-1">Everything an examiner needs to reproduce {monthLabel(ev.period)}: the query behind each test, what it counted, and who reviewed the results.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center no-print">
          <label className="text-xs muted flex items-center gap-1">Month
            <select value={ev.period} onChange={(e) => setPeriod(e.target.value)} className="btn !py-1">
              {ev.periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}
            </select>
          </label>
          <button className="btn" onClick={download}><Download className="w-4 h-4" aria-hidden />CSV</button>
          <button className="btn" onClick={() => window.print()}><Printer className="w-4 h-4" aria-hidden />PDF</button>
          <SourceBadge p={ev} />
        </div>
      </div>

      <Card title={`Runs, ${monthLabel(ev.period)}`} right={<span className="no-print flex gap-2"><PoweredBy>Query history</PoweredBy><PoweredBy>Time Travel</PoweredBy></span>}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Control</th><th>Records tested</th><th>Exceptions</th><th>Query ID</th><th>Run</th><th>Dispositions</th><th>Reproduce</th></tr></thead>
            <tbody>
              {ev.runs.map((r) => (
                <tr key={r.run_id}>
                  <td><div className="font-medium">{r.control_id}</div><div className="text-xs muted max-w-[16rem]">{r.control_name}</div></td>
                  <td className="tabular">{r.population_count.toLocaleString()}</td>
                  <td className="tabular">{r.exception_count}</td>
                  <td className="text-[11px] font-mono break-all max-w-[12rem]">{r.query_id}</td>
                  <td className="text-xs">{new Date(r.run_ts).toLocaleString()}<div className="muted">{r.run_by} · {r.trigger_type}</div></td>
                  <td className="text-xs space-y-0.5">{r.dispositions.length ? r.dispositions.map((d) => (
                    <div key={d.disposition}><Tag tone={d.disposition === 'Open' ? 'muted' : 'good'}>{d.disposition}</Tag> {d.count}{d.reviewers.length ? ` · ${d.reviewers.join(', ')}` : ''}</div>
                  )) : <span className="muted">None</span>}</td>
                  <td><RecountButton run={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mt-2">Source tables keep 30 days of Time Travel. Recount reruns <code>SELECT COUNT(*) … AT(TIMESTAMP =&gt; run time)</code> on the tested table.</p>
      </Card>

      <Card title="Data quality at run time" right={<PoweredBy>Data metric functions</PoweredBy>}>
        {anomalies.length
          ? <p className="text-sm"><Tag tone="warn">Anomaly</Tag> {anomalies.map((f) => `${f.feed_batch_id}: ${f.metric_value}% of large wires had no second approver (baseline ${f.baseline_value}%)`).join('; ')}.</p>
          : <p className="text-sm">No feed anomalies this month. {ev.feed.filter((f) => f.metric === 'APPROVER_2_NULL_PCT').length} wire feed batches measured.</p>}
      </Card>
    </div>
  );
}
