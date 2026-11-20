'use client';

// Exception queue: open exceptions grouped into root-cause clusters, with severity, age and
// data-quality signals. Bulk disposition needs a note and is logged with the reviewer and time.
import { ChevronRight, Filter, Search, Stamp as StampIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCoverage } from '@/components/Shell';
import { ChartTip, Empty, ErrorState, Kpi, PageSkeleton, Pill, PoweredBy, Severity, Sheet, Source, Stamp, dispositionTone } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import { DISPOSITIONS, type Cluster, type Disposition } from '@/lib/types';

function BulkBar({ selected, clusters, onDone }: { selected: Cluster[]; clusters: number; onDone: (d: Disposition, n: number) => void }) {
  const [disp, setDisp] = useState<Disposition>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const ids = selected.flatMap((c) => c.ids);
  const suggested = selected.every((c) => c.anomaly) ? 'Data issue' : undefined;
  const submit = async () => {
    if (!disp || !note.trim()) return;
    setBusy(true); setErr(undefined);
    try { const r = await data.dispose(ids, disp, note.trim()); onDone(disp, r.updated); setNote(''); setDisp(undefined); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed bottom-4 inset-x-4 z-30 rise">
      <div className="max-w-[1100px] mx-auto sheet !border-ink/30 p-3 flex flex-col lg:flex-row lg:items-center gap-3 shadow-2xl">
        <div className="shrink-0"><div className="cond text-[15px]">{ids.length.toLocaleString()} exceptions</div><div className="text-[11.5px] text-muted">in {selected.length} of {clusters} clusters</div></div>
        <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Disposition">
          {DISPOSITIONS.map((d) => (
            <button key={d} role="radio" aria-checked={disp === d} onClick={() => setDisp(d)}
              className={`px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors ${disp === d ? `bg-${dispositionTone(d)} text-on-ink border-transparent` : 'border-rule hover:border-ink'}`}>
              {d}{suggested === d && <span className="ml-1 font-normal opacity-80">· suggested</span>}</button>
          ))}
        </div>
        <label className="flex-1 min-w-0"><span className="sr-only">Note (required)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the evidence pack (required)" maxLength={500}
            className="w-full rounded-md border border-rule bg-sheet px-3 py-1.5 text-[13px] focus:border-ink outline-none" /></label>
        <button className="btn btn-ink" disabled={!disp || !note.trim() || busy} onClick={submit}><StampIcon className="w-4 h-4" aria-hidden />{busy ? 'Recording…' : 'Record disposition'}</button>
        {err && <span role="alert" className="text-[12px] text-pen">{err}</span>}
      </div>
    </div>
  );
}
// bg-pen bg-feed bg-waive

function QueueInner() {
  const params = useSearchParams(); const router = useRouter();
  const period = params.get('period') ?? 'all';
  const { reload: reloadCoverage } = useCoverage();
  const q = useAsync(() => data.queue(), [], { keep: true });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sev, setSev] = useState<'All' | 'High' | 'Medium'>('All');
  const [signalOnly, setSignalOnly] = useState(false);
  const [text, setText] = useState('');
  const [done, setDone] = useState<Record<string, Disposition>>({});
  const [toast, setToast] = useState<string>();

  const periods = useMemo(() => [...new Set(q.data?.clusters.map((c) => c.period_start) ?? [])].sort(), [q.data]);
  const rows = useMemo(() => (q.data?.clusters ?? []).filter((c) => (period === 'all' || c.period_start === period) && (sev === 'All' || c.severity === sev)
    && (!signalOnly || c.anomaly) && (!text || `${c.control_id} ${c.control_name} ${c.cluster_key}`.toLowerCase().includes(text.toLowerCase()))), [q.data, period, sev, signalOnly, text]);
  if (q.error) return <ErrorState error={q.error} retry={q.reload} />;
  if (!q.data) return <PageSkeleton />;

  const all = q.data.clusters;
  const anomaly = all.filter((c) => c.anomaly);
  const byControl = Object.entries(rows.reduce<Record<string, number>>((a, c) => ({ ...a, [c.control_id]: (a[c.control_id] ?? 0) + c.count }), {}))
    .map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const selected = rows.filter((c) => sel.has(c.key));
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setPeriod = (p: string) => router.replace(p === 'all' ? '/queue' : `/queue?period=${p}`);

  return (
    <div className="space-y-5 pb-28">
      <div className="flex items-end justify-between gap-3 flex-wrap rise">
        <div>
          <div className="eyebrow">Exception queue</div>
          <h1 className="cond text-[28px] leading-tight mt-0.5">{q.data.total.toLocaleString()} open exceptions in {all.length} clusters</h1>
          <p className="text-muted text-[13.5px] mt-1 max-w-2xl">Grouped by root cause (feed batch, system, document or approver) so one decision can cover a whole cluster. Every disposition needs a note.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap"><PoweredBy>Dynamic Tables</PoweredBy><Source p={q.data} /></div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <Kpi label="Open exceptions" value={q.data.total} />
        <Kpi label="High severity" value={all.filter((c) => c.severity === 'High').reduce((a, c) => a + c.count, 0)} deltaTone="pen" delta="High" note="severity clusters" />
        <Kpi label="Biggest cluster" value={all[0]?.count ?? 0} note={all[0] ? <span className="font-mono">{all[0].control_id} · {all[0].cluster_key}</span> : undefined} />
        <Kpi label="Oldest cluster" value={Math.max(0, ...all.map((c) => c.ageDays))} format={(n) => `${Math.round(n)} d`} note="since period end" />
      </div>

      {anomaly.length > 0 && (
        <div className="sheet !border-feed/40 bg-feed-soft p-4 flex flex-col md:flex-row md:items-center gap-3 rise">
          <span className="pill bg-feed text-on-ink self-start">Data metric function</span>
          <p className="text-[13.5px] flex-1">{anomaly.reduce((a, c) => a + c.count, 0)} open exceptions sit in feed batches flagged as anomalous ({anomaly.map((c) => c.cluster_key).join(', ')}). Review them as possible <b>data issues</b> before routing them as control failures.</p>
          <button className="btn btn-sm shrink-0" onClick={() => { setSignalOnly(true); setPeriod('all'); }}>Show flagged clusters</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Sheet pad={false} className="xl:col-span-3 rise" title="Clusters"
          right={<div className="flex items-center gap-2 flex-wrap">
            <label className="relative"><span className="sr-only">Search clusters</span><Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted" aria-hidden />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search" className="pl-7 pr-2 py-1 rounded-md border border-rule bg-sheet text-[12.5px] w-36" /></label>
            <label className="text-[12px] text-muted flex items-center gap-1"><Filter className="w-3.5 h-3.5" aria-hidden />
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-md border border-rule bg-sheet px-1.5 py-1 text-ink" aria-label="Month">
                <option value="all">All months</option>{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</select></label>
            <select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} className="rounded-md border border-rule bg-sheet px-1.5 py-1 text-[12px]" aria-label="Severity">
              <option>All</option><option>High</option><option>Medium</option></select>
            <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={signalOnly} onChange={(e) => setSignalOnly(e.target.checked)} />Feed anomaly</label>
          </div>}>
          {rows.length === 0 ? <Empty title="No open clusters match">Clear a filter, or pick another month in the ribbon above.</Empty> : (
            <div className="scroll-x max-h-[620px] overflow-y-auto">
              <table className="tbl">
                <thead><tr>
                  <th className="w-8"><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => sel.has(r.key) || done[r.key])}
                    onChange={(e) => setSel(e.target.checked ? new Set(rows.filter((r) => !done[r.key]).map((r) => r.key)) : new Set())} /></th>
                  <th>Cluster</th><th>Month</th><th>Count</th><th>Severity</th><th>Age</th><th>Signal</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.key} className={sel.has(c.key) ? 'is-selected' : ''}>
                      <td><input type="checkbox" aria-label={`Select ${c.control_id} ${c.cluster_key}`} disabled={!!done[c.key]} checked={sel.has(c.key)} onChange={() => toggle(c.key)} /></td>
                      <td className="min-w-[240px]"><div className="flex items-center gap-2"><span className="font-mono text-[12px] font-semibold">{c.control_id}</span><span className="text-muted text-[12px] truncate max-w-[260px]">{c.control_name}</span></div>
                        <div className="font-medium">{c.cluster_key}</div></td>
                      <td className="whitespace-nowrap">{monthLabel(c.period_start)}</td>
                      <td className="num font-semibold">{c.count.toLocaleString()}</td>
                      <td><Severity s={c.severity} /></td>
                      <td className="num text-muted">{c.ageDays} d</td>
                      <td>{done[c.key] ? <Stamp d={done[c.key]} /> : c.anomaly ? <Pill tone="feed" title={`${c.anomaly.metric_value}% null vs ${c.anomaly.baseline_value}% baseline`}>Feed anomaly · {c.anomaly.metric_value}%</Pill> : <span className="text-muted text-[12px]">–</span>}</td>
                      <td><Link href={`/exception?id=${encodeURIComponent(c.ids[0])}`} className="btn btn-sm">Review<ChevronRight className="w-3.5 h-3.5" aria-hidden /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sheet>
        <Sheet className="rise" eyebrow="Shown clusters" title="Open by control">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={byControl} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="id" width={46} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="n" name="Open" radius={[0, 3, 3, 0]} barSize={12}>
                  {byControl.map((b) => <Cell key={b.id} fill={anomaly.some((a) => a.control_id === b.id) ? 'var(--feed)' : 'var(--pen)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11.5px] text-muted">Cobalt: the control has clusters in a flagged feed batch.</p>
        </Sheet>
      </div>

      {toast && <div role="status" className="fixed top-20 right-4 z-50 sheet px-4 py-2.5 text-[13px] rise">{toast}</div>}
      {selected.length > 0 && <BulkBar selected={selected} clusters={rows.length} onDone={(d, n) => {
        setDone((x) => ({ ...x, ...Object.fromEntries(selected.map((c) => [c.key, d])) })); setSel(new Set());
        setToast(`${n} exceptions recorded as ${d}. Logged for the evidence pack.`); setTimeout(() => setToast(undefined), 4000);
        reloadCoverage();
      }} />}
    </div>
  );
}

export default function QueuePage() { return <Suspense fallback={<PageSkeleton />}><QueueInner /></Suspense>; }
