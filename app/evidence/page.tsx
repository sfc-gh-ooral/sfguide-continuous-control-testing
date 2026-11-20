'use client';

// Evidence pack: one snapshot per monthly run — query ID, records tested, exceptions, run time,
// dispositions and reviewers — with a Time Travel recount. Exports as CSV or PDF (browser print).
import { Download, FileCheck2, History, Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorState, Kpi, Logo, PageSkeleton, Pill, PoweredBy, Sheet, Source, SqlBlock, dispositionTone } from '@/components/ui';
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

function Recounter({ run }: { run: EvidenceRun }) {
  const [r, setR] = useState<Recount>(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string>();
  if (r) return (
    <div className="text-[12px] rise"><span className={`stamp ${r.rows > 0 ? 'text-tick' : 'text-waive'}`}>Recounted</span>
      <div className="mt-1"><b className="num">{r.rows.toLocaleString()}</b> rows in {r.table} as of the run</div>
      <div className="text-muted font-mono break-all">{r.queryId ? `query ${r.queryId} · ${r.latencyMs} ms` : 'Sample data'}</div></div>
  );
  return (
    <span className="no-print">
      <button className="btn btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { setR(await data.recount(run.run_id)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>
        <History className="w-3.5 h-3.5" aria-hidden />{busy ? 'Recounting…' : 'Recount as of run'}</button>
      {err && <span role="alert" className="block text-[11.5px] text-pen mt-1">{err}</span>}
    </span>
  );
}

function Inner() {
  const initial = useSearchParams().get('period') ?? undefined;
  const [period, setPeriod] = useState<string | undefined>(initial);
  const ev = useAsync(() => data.evidence(period), [period], { keep: true });
  if (ev.error) return <ErrorState error={ev.error} retry={ev.reload} />;
  if (!ev.data) return <PageSkeleton />;
  const e = ev.data;
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(e.runs)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `evidence-${e.period}.csv` }).click(); URL.revokeObjectURL(url);
  };
  const tested = e.runs.reduce((a, r) => a + r.population_count, 0);
  const exc = e.runs.reduce((a, r) => a + r.exception_count, 0);
  const reviewed = e.runs.reduce((a, r) => a + r.dispositions.filter((d) => d.disposition !== 'Open').reduce((x, d) => x + d.count, 0), 0);
  const anomalies = e.feed.filter((f) => f.is_anomaly);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap rise">
        <div>
          <div className="eyebrow">Evidence pack</div>
          <h1 className="cond text-[28px] leading-tight mt-0.5 flex items-center gap-2"><span className="hidden print:inline"><Logo size={22} /></span>{monthLabel(e.period)} control testing evidence</h1>
          <p className="text-muted text-[13.5px] mt-1 max-w-2xl">What an examiner needs to reproduce the month: the query behind each test, what it counted, and who reviewed the results.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center no-print">
          <select value={e.period} onChange={(x) => setPeriod(x.target.value)} aria-label="Month" className="rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px]">
            {e.periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</select>
          <button className="btn" onClick={download}><Download className="w-4 h-4" aria-hidden />CSV</button>
          <button className="btn btn-ink" onClick={() => window.print()}><Printer className="w-4 h-4" aria-hidden />Export PDF</button>
          <Source p={e} />
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <Kpi label="Test runs" value={e.runs.length} icon={<FileCheck2 className="w-4 h-4" />} note="each with a query ID" />
        <Kpi label="Records tested" value={tested} />
        <Kpi label="Exceptions" value={exc} />
        <Kpi label="Dispositioned" value={reviewed} note={`of ${exc}, with reviewer and note`} deltaTone={reviewed === exc ? 'tick' : 'muted'} delta={exc ? `${Math.round((100 * reviewed) / exc)}%` : undefined} />
      </div>

      <Sheet pad={false} className="rise" eyebrow={`Run ledger · ${monthLabel(e.period)}`} title="Runs" right={<span className="no-print flex gap-2 flex-wrap"><PoweredBy>Query history</PoweredBy><PoweredBy>Time Travel</PoweredBy></span>}>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Control</th><th>Tested</th><th>Exceptions</th><th>Query ID</th><th>Run</th><th>Dispositions</th><th className="no-print">Reproduce</th></tr></thead>
            <tbody>
              {e.runs.map((r) => (
                <tr key={r.run_id}>
                  <td className="min-w-[200px]"><div className="font-mono text-[12px] font-semibold">{r.control_id}</div><div className="text-[12.5px]">{r.control_name}</div></td>
                  <td className="num">{r.population_count.toLocaleString()}</td>
                  <td className="num font-semibold">{r.exception_count}</td>
                  <td className="font-mono text-[11px] break-all min-w-[150px] max-w-[190px]">{r.query_id}</td>
                  <td className="text-[12px] whitespace-nowrap">{new Date(r.run_ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}<div className="text-muted">{r.run_by} · {r.trigger_type}</div></td>
                  <td className="text-[12px] space-y-1 min-w-[150px]">{r.dispositions.length ? r.dispositions.map((d) => (
                    <div key={d.disposition} className="flex items-center gap-1.5 flex-wrap"><Pill tone={dispositionTone(d.disposition)}>{d.disposition}</Pill><span className="num">{d.count}</span>{d.reviewers.length > 0 && <span className="text-muted">· {d.reviewers.join(', ')}</span>}</div>
                  )) : <span className="text-muted">No exceptions</span>}</td>
                  <td className="no-print min-w-[170px]"><Recounter run={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Sheet className="rise" eyebrow="Data quality at run time" title={anomalies.length ? `${anomalies.length} feed batch flagged` : 'No feed anomalies'} right={<PoweredBy>Data metric functions</PoweredBy>}>
          <ul className="space-y-1.5 text-[13px]">
            {e.feed.filter((f) => f.metric === 'APPROVER_2_NULL_PCT').map((f) => (
              <li key={f.feed_batch_id} className="flex items-center justify-between gap-3 border-b border-rule pb-1.5">
                <span className="font-mono text-[12px]">{f.feed_batch_id}</span>
                <span className="num">{f.metric_value}% null <span className="text-muted">· baseline {f.baseline_value ?? '–'}%</span> {f.is_anomaly && <Pill tone="feed">Anomaly</Pill>}</span>
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet className="rise" eyebrow="How to reproduce" title="Recount a population as of the run">
          <SqlBlock sql={`SELECT COUNT(*) FROM CONTROL_TESTING_DEMO.SRC.WIRE_PAYMENTS\n  AT(TIMESTAMP => '<run_ts>'::TIMESTAMP_LTZ);\n\nSELECT query_text, rows_produced\nFROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY\nWHERE query_id = '<query_id>';`} />
          <p className="text-[11.5px] text-muted mt-2">Source tables keep 30 days of Time Travel. Query IDs point to the exact statement each test ran.</p>
        </Sheet>
      </div>
    </div>
  );
}

export default function EvidencePage() { return <Suspense fallback={<PageSkeleton />}><Inner /></Suspense>; }
