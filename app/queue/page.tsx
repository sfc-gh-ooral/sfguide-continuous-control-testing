'use client';

// Exception queue: open exceptions grouped by root-cause cluster, with severity, age, and the
// feed-quality signal from the data metric function. Bulk disposition needs a note.
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DispositionForm } from '@/components/DispositionForm';
import { ErrorBox, Tag } from '@/components/Status';
import { Card, PoweredBy, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';

export default function QueuePage() {
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string>();
  const [done, setDone] = useState<string>();
  const { data: q, error, loading } = useAsync(() => data.queue(), [reload]);
  if (error) return <ErrorBox error={error} />;
  if (loading || !q) return <Thinking label="Loading exceptions" />;

  const ids = q.clusters.filter((c) => selected.has(c.key)).flatMap((c) => c.ids);
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-5 stagger">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Exception queue</h1>
          <p className="text-sm text-2 mt-1">{q.total.toLocaleString()} open exceptions in {q.clusters.length} root-cause clusters.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>Data metric functions</PoweredBy><SourceBadge p={q} /></div>
      </div>

      <Card title={ids.length ? `${ids.length} exceptions selected` : 'Bulk disposition'} className="sticky top-16 z-20">
        {done && <p className="text-sm mb-2" role="status" style={{ color: 'var(--positive)' }}>{done}</p>}
        <DispositionForm ids={ids} onDone={(n) => { setDone(`Saved ${n} disposition${n === 1 ? '' : 's'}.`); setSelected(new Set()); setReload((r) => r + 1); }} />
        {!ids.length && <p className="text-xs muted mt-2">Select one or more clusters below, choose a disposition, and add a note.</p>}
      </Card>

      <div className="space-y-2">
        {q.clusters.map((c) => {
          const isOpen = openKey === c.key;
          return (
            <section key={c.key} className="card p-3 md:p-4" style={c.anomaly ? { borderColor: 'var(--warning)' } : undefined}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 w-4 h-4" checked={selected.has(c.key)} onChange={() => toggle(c.key)}
                  aria-label={`Select ${c.count} exceptions: ${c.control_id} ${c.cluster_key}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.control_id}</span>
                    <span className="text-sm text-2 truncate">{c.cluster_key}</span>
                    <Tag tone={c.severity === 'High' ? 'bad' : 'warn'}>{c.severity}</Tag>
                    {c.anomaly && <Tag tone="warn" title="Data metric function result for this feed batch"><Database className="w-3 h-3" aria-hidden />Feed anomaly: {c.anomaly.metric_value}% approver_2 null (baseline {c.anomaly.baseline_value}%)</Tag>}
                  </div>
                  <div className="text-xs muted mt-0.5">{c.control_name} · {monthLabel(c.period_start)} · {c.ageDays} days old</div>
                  {c.anomaly && <p className="text-xs mt-1.5">Most of this batch arrived without a second approver. Check the feed before treating these as control failures.</p>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular">{c.count}</div>
                  <button className="text-xs underline muted inline-flex items-center gap-0.5" onClick={() => setOpenKey(isOpen ? undefined : c.key)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronDown className="w-3 h-3" aria-hidden /> : <ChevronRight className="w-3 h-3" aria-hidden />}Records
                  </button>
                </div>
              </div>
              {isOpen && (
                <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-1.5 text-xs">
                  {c.ids.slice(0, 24).map((id) => (
                    <li key={id}><Link href={`/exception?id=${encodeURIComponent(id)}`} className="underline">{id.split('-').slice(0, 2).join('-')} #{id.split('-').at(-1)}</Link></li>
                  ))}
                  {c.ids.length > 24 && <li className="muted">and {c.ids.length - 24} more</li>}
                </ul>
              )}
              {!isOpen && <Link href={`/exception?id=${encodeURIComponent(c.ids[0])}`} className="text-xs underline mt-2 inline-block">Open an example</Link>}
            </section>
          );
        })}
        {!q.clusters.length && <Card><p className="text-sm">No open exceptions.</p></Card>}
      </div>
    </div>
  );
}
