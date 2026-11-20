'use client';

// Control coverage: what is tested on the full population, what is still sampled, and how
// exception counts move month to month.
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorBox, Tag } from '@/components/Status';
import { Card, Kpi, PoweredBy, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import type { CoverageControl } from '@/lib/types';

const DOMAINS = ['Access', 'Payments', 'Lending', 'Change management'] as const;
const DOMAIN_COLOR: Record<string, string> = { Access: 'var(--chart-1)', Payments: 'var(--chart-5)', Lending: 'var(--chart-2)', 'Change management': 'var(--chart-3)' };

function Spark({ values }: { values: (number | null)[] }) {
  return (
    <div className="w-28 h-8" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={values.map((v, i) => ({ i, v }))}><Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.8} dot={false} isAnimationActive={false} /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tested({ c }: { c: CoverageControl }) {
  if (!c.automated) return <span className="text-xs muted">Sample of {c.prior_sample_size}</span>;
  return (
    <span className="text-xs">
      <strong className="tabular">{(c.last?.population_count ?? 0).toLocaleString()}</strong> <span className="muted">(100%) · was {c.prior_sample_size}</span>
    </span>
  );
}

export default function CoveragePage() {
  const { data: d, error, loading } = useAsync(() => data.coverage(), []);
  if (error) return <ErrorBox error={error} />;
  if (loading || !d) return <Thinking label="Loading coverage" />;
  const k = d.kpis;
  const auto = d.controls.filter((c) => c.automated);
  const byMonth = d.months.map((m, i) => ({
    month: monthLabel(m).replace(' 2026', ''),
    ...Object.fromEntries(DOMAINS.map((dom) => [dom, auto.filter((c) => c.domain === dom).reduce((a, c) => a + (c.trend[i] ?? 0), 0)])),
  }));
  const py01 = auto.find((c) => c.control_id === 'PY-01');
  const spike = py01 ? Math.round((py01.trend[7] ?? 0) / Math.max(1, py01.trend[6] ?? 1)) : 0;

  return (
    <div className="space-y-5 stagger">
      <div className="hero">
        <div className="flex items-start justify-between gap-3 flex-wrap relative z-10">
          <div>
            <h1 className="page-title">Control coverage</h1>
            <p className="text-sm text-2 mt-1 max-w-2xl">
              {k.automated} of {k.total} controls now test every record each month instead of a quarterly sample.
              Latest run: {monthLabel(k.lastPeriod)}.
            </p>
          </div>
          <SourceBadge p={d} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Controls automated" value={`${k.automated} / ${k.total}`} sub="Full population, monthly" />
        <Kpi label="Records tested" value={k.tested.toLocaleString()} sub={`Last month · sample was ${k.sampledBefore}`} />
        <Kpi label="Coverage gain" value={`${Math.round(k.tested / Math.max(1, k.sampledBefore))}x`} sub="Records tested vs. old sample size" />
        <Kpi label="Open exceptions" value={k.open.toLocaleString()} sub="Latest run, not yet dispositioned" />
      </div>

      <Card title="Exceptions by month, automated controls" right={<><PoweredBy>Tasks</PoweredBy><PoweredBy>Dynamic Tables</PoweredBy></>}>
        <div className="h-60" role="img" aria-label={`Bar chart of monthly exceptions by domain. Payments spikes in August${spike ? `, about ${spike} times July` : ''}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byMonth} margin={{ left: -18, right: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              {DOMAINS.map((dom) => <Bar key={dom} dataKey={dom} stackId="a" fill={DOMAIN_COLOR[dom]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 text-xs muted mt-2">
          {DOMAINS.map((dom) => <span key={dom} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: DOMAIN_COLOR[dom] }} />{dom}</span>)}
        </div>
        {spike > 3 && (
          <p className="text-sm mt-3">
            <Tag tone="warn">Spike</Tag> PY-01 found {py01?.trend[7]} exceptions in August, about {spike}x July.{' '}
            <Link href="/queue" className="underline">Review it in the exception queue</Link>.
          </p>
        )}
      </Card>

      <Card title="All controls">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Control</th><th>Domain</th><th>Owner</th><th>Records tested</th><th>Exceptions</th><th>Rate</th><th>Trend</th><th>Status</th></tr>
            </thead>
            <tbody>
              {d.controls.map((c) => (
                <tr key={c.control_id}>
                  <td><div className="font-medium">{c.control_id}</div><div className="text-xs muted max-w-[18rem]">{c.control_name}</div></td>
                  <td className="text-xs">{c.domain}</td>
                  <td className="text-xs">{c.team}</td>
                  <td><Tested c={c} /></td>
                  <td className="tabular">{c.automated ? c.last?.exception_count ?? 0 : <span className="muted text-xs">{c.last_sample_exceptions} in sample</span>}</td>
                  <td className="tabular text-xs">{c.automated && c.last ? `${((100 * c.last.exception_count) / Math.max(1, c.last.population_count)).toFixed(1)}%` : '—'}</td>
                  <td>{c.automated ? <Spark values={c.trend} /> : <span className="text-xs muted">Quarterly</span>}</td>
                  <td>{c.status === 'Pass' ? <Tag tone="good">Pass</Tag> : c.status === 'Exceptions' ? <Tag tone="bad">{c.open} open</Tag> : <Tag>Sampled</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
