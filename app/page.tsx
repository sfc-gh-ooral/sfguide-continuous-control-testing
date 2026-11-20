'use client';

// Control coverage: what was tested last month, full population against the old quarterly sample,
// and a controls × months heatmap of exceptions with data-quality (DMF) flags.
import { ArrowUpRight, Layers, ListChecks, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCoverage } from '@/components/Shell';
import { ChartTip, ErrorState, Kpi, PageSkeleton, Pill, PoweredBy, Sheet, Source } from '@/components/ui';
import { monthLabel } from '@/lib/build';
import type { CoverageControl } from '@/lib/types';

const DOMAINS = ['All', 'Access', 'Payments', 'Lending', 'Change management', 'Finance'];
type SortKey = 'control_id' | 'population' | 'exceptions' | 'rate';

function Heatmap({ controls, months, anomalies }: { controls: CoverageControl[]; months: string[]; anomalies: Set<string> }) {
  const max = Math.max(1, ...controls.flatMap((c) => c.trend.map((v) => v ?? 0)));
  return (
    <div className="scroll-x">
      <table className="text-[12px] border-separate" style={{ borderSpacing: 3 }}>
        <thead><tr><th className="text-left font-medium text-muted pr-2 min-w-[150px]">Control</th>
          {months.map((m) => <th key={m} className="font-medium text-muted w-[54px] min-w-[44px]">{monthLabel(m).slice(0, 3)}</th>)}</tr></thead>
        <tbody>
          {controls.map((c) => (
            <tr key={c.control_id}>
              <td className="pr-2 whitespace-nowrap"><span className="font-mono font-semibold">{c.control_id}</span> <span className="text-muted">{c.control_name.split(' ').slice(0, 3).join(' ')}…</span></td>
              {c.trend.map((v, i) => {
                const flag = c.source_table === 'SRC.WIRE_PAYMENTS' && anomalies.has(months[i]) && c.control_id === 'PY-01';
                const k = (v ?? 0) / max;
                return (
                  <td key={i} title={`${c.control_id} · ${monthLabel(months[i])}: ${v ?? 0} exceptions${flag ? ' · feed anomaly flagged by DMF' : ''}`}
                    className="relative h-8 rounded-[4px] text-center num font-semibold transition-transform hover:scale-110"
                    style={{ background: v ? `color-mix(in srgb, var(--pen) ${Math.round(12 + k * 78)}%, var(--sheet))` : 'var(--sheet-2)', color: k > 0.45 ? '#fff' : 'var(--ink)' }}>
                    {v ?? '–'}
                    {flag && <span className="absolute top-0 right-0 w-0 h-0 border-t-[10px] border-l-[10px] border-t-[var(--feed)] border-l-transparent rounded-tr-[4px]" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-2 text-[11.5px] text-muted flex-wrap">
        <span className="flex items-center gap-1.5">Fewer<span className="w-16 h-2 rounded" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--pen) 12%, var(--sheet)), var(--pen))' }} />More exceptions</span>
        <span className="flex items-center gap-1.5"><span className="w-0 h-0 border-t-[9px] border-l-[9px] border-t-[var(--feed)] border-l-transparent" />Feed anomaly flagged by a data metric function</span>
      </div>
    </div>
  );
}

export default function CoveragePage() {
  const { coverage: c, error, reload } = useCoverage();
  const [domain, setDomain] = useState('All');
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'control_id', desc: false });
  const rows = useMemo(() => {
    if (!c) return [];
    const val = (x: CoverageControl) => sort.k === 'population' ? x.last?.population_count ?? -1 : sort.k === 'exceptions' ? x.last?.exception_count ?? -1
      : sort.k === 'rate' ? (x.last ? x.last.exception_count / Math.max(1, x.last.population_count) : -1) : x.control_id;
    return c.controls.filter((x) => domain === 'All' || x.domain === domain)
      .sort((a, b) => { const va = val(a), vb = val(b); const r = va < vb ? -1 : va > vb ? 1 : 0; return sort.desc ? -r : r; });
  }, [c, domain, sort]);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!c) return <PageSkeleton />;

  const auto = c.controls.filter((x) => x.automated);
  const totals = c.months.map((_, i) => auto.reduce((a, x) => a + (x.trend[i] ?? 0), 0));
  const last = totals.at(-1) ?? 0, prev = totals.at(-2) ?? 0;
  const anomalyMonths = new Set(c.anomalies.map((a) => a.period_start));
  const sampleBars = auto.map((x) => ({ id: x.control_id, 'Quarterly sample': x.prior_sample_size, 'Full population': x.last?.population_count ?? 0 }));
  const th = (k: SortKey, label: string) => (
    <th aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button className="uppercase tracking-[.05em] hover:text-ink" onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : k !== 'control_id' })}>
        {label}{sort.k === k ? (sort.desc ? ' ↓' : ' ↑') : ''}</button></th>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap rise">
        <div>
          <div className="eyebrow">Control coverage · {monthLabel(c.kpis.lastPeriod)}</div>
          <h1 className="cond text-[28px] leading-tight mt-0.5">Every record tested, every month</h1>
          <p className="text-muted text-[13.5px] mt-1 max-w-2xl">{c.kpis.automated} of {c.kpis.total} controls now run as monthly tests over the full population. The rest still rely on a quarterly sample.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center"><PoweredBy>Snowflake Tasks</PoweredBy><PoweredBy>Dynamic Tables</PoweredBy><Source p={c} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <Kpi label={`Records tested · ${monthLabel(c.kpis.lastPeriod).slice(0, 3)}`} value={c.kpis.tested} icon={<Layers className="w-4 h-4" />}
          delta={`${(c.kpis.tested / Math.max(1, c.kpis.sampledBefore)).toFixed(1)}×`} deltaTone="tick" note={`the ${c.kpis.sampledBefore} records the old samples covered`} />
        <Kpi label="Automated controls" value={c.kpis.automated} format={(n) => `${Math.round(n)} / ${c.kpis.total}`} icon={<ShieldCheck className="w-4 h-4" />}
          note={`${c.kpis.total - c.kpis.automated} still sampled quarterly`} />
        <Kpi label="Exceptions found · month" value={last} icon={<TriangleAlert className="w-4 h-4" />} spark={totals} sparkColor="var(--pen)"
          delta={`${last >= prev ? '+' : ''}${last - prev}`} deltaTone={last > prev ? 'pen' : 'tick'} note={`vs ${monthLabel(c.months.at(-2) ?? '').slice(0, 3)}`} />
        <Kpi label="Open exceptions" value={c.kpis.open} icon={<ListChecks className="w-4 h-4" />}
          note={<Link href="/queue" className="inline-flex items-center gap-0.5 text-ink font-medium hover:text-pen">Work the queue<ArrowUpRight className="w-3 h-3" /></Link>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Sheet className="xl:col-span-3 rise" eyebrow="Exceptions per control per month" title="Where the exceptions are"
          right={<PoweredBy>Data metric functions</PoweredBy>}>
          <Heatmap controls={auto} months={c.months} anomalies={anomalyMonths} />
          {c.anomalies.map((a) => (
            <Link key={a.feed_batch_id} href={`/queue?period=${a.period_start}`} className="mt-3 flex items-start gap-2 rounded-lg border border-feed/30 bg-feed-soft px-3 py-2 text-[12.5px] hover:border-feed transition-colors">
              <span className="pill bg-feed text-on-ink shrink-0">Feed anomaly</span>
              <span>{monthLabel(a.period_start)}: batch <span className="font-mono font-semibold">{a.feed_batch_id}</span> arrived with the second approver blank on <b>{a.metric_value}%</b> of large wires (baseline {a.baseline_value}%). Check it before calling the PY-01 spike a control failure.</span>
            </Link>
          ))}
        </Sheet>
        <Sheet className="xl:col-span-2 rise" eyebrow={monthLabel(c.kpis.lastPeriod)} title="Quarterly sample vs. full population">
          <div className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={sampleBars} layout="vertical" margin={{ left: 0, right: 12 }} barGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="id" width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Quarterly sample" fill="var(--muted)" radius={[0, 3, 3, 0]} barSize={7} />
                <Bar dataKey="Full population" fill="var(--ink)" radius={[0, 3, 3, 0]} barSize={7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11.5px] text-muted">Sample sizes are the last manual test of each control; populations are the records the monthly test read.</p>
        </Sheet>
      </div>

      <Sheet pad={false} className="rise" eyebrow="Control library" title={`${rows.length} controls`}
        right={<div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by domain">{DOMAINS.map((d) => (
          <button key={d} onClick={() => setDomain(d)} aria-pressed={domain === d}
            className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${domain === d ? 'bg-ink text-on-ink border-ink' : 'border-rule text-muted hover:text-ink'}`}>{d}</button>))}</div>}>
        <div className="scroll-x max-h-[560px] overflow-y-auto">
          <table className="tbl">
            <thead><tr>{th('control_id', 'Control')}<th>Method</th>{th('population', 'Tested')}{th('exceptions', 'Exceptions')}{th('rate', 'Rate')}<th>Trend</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((x) => {
                const rate = x.last ? (100 * x.last.exception_count) / Math.max(1, x.last.population_count) : null;
                const max = Math.max(1, ...x.trend.map((v) => v ?? 0));
                return (
                  <tr key={x.control_id}>
                    <td className="min-w-[230px]"><div className="font-mono text-[12px] font-semibold">{x.control_id}</div><div>{x.control_name}</div></td>
                    <td className="text-[12px] whitespace-nowrap">{x.automated ? <span>Monthly · <b>100%</b></span> : <span className="text-muted">Quarterly · n={x.prior_sample_size}</span>}</td>
                    <td className="num">{x.last ? x.last.population_count.toLocaleString() : <span className="text-muted">{x.prior_sample_size}</span>}</td>
                    <td className="num">{x.last ? x.last.exception_count : <span className="text-muted">{x.last_sample_exceptions}</span>}</td>
                    <td className="num">{rate === null ? '–' : `${rate.toFixed(2)}%`}</td>
                    <td>{x.automated ? <div className="flex items-end gap-[2px] h-6" aria-label={`Trend: ${x.trend.join(', ')}`}>{x.trend.map((v, i) => (
                      <span key={i} className={`w-[5px] rounded-[1px] ${i === x.trend.length - 1 ? 'bg-pen' : 'bg-ink/30'}`} style={{ height: `${Math.max(6, ((v ?? 0) / max) * 100)}%` }} />))}</div> : <span className="text-muted text-[12px]">–</span>}</td>
                    <td className="text-[12px] whitespace-nowrap">{x.owner_name}<div className="text-muted">{x.team}</div></td>
                    <td>{x.status === 'Pass' ? <Pill tone="tick">Pass</Pill> : x.status === 'Exceptions' ? (x.open ? <Pill tone="pen">{x.open} open</Pill> : <Pill tone="waive">Reviewed</Pill>) : <Pill>Sampled</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sheet>
    </div>
  );
}
