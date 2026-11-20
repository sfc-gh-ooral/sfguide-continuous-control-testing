// Builds every screen from a Snapshot, so Sample and Live mode share one set of rules.
import type { Cluster, Coverage, Evidence, EvidenceRun, ExceptionDetail, ExceptionRow, Queue, Snapshot } from './types';

const DAY = 864e5;
const monthEnd = (p: string) => { const d = new Date(`${p}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); };
export const monthLabel = (p: string) => new Date(`${p}T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function coverage(s: Snapshot, openByRun?: Map<string, number>): Omit<Coverage, 'source'> {
  const months = [...new Set(s.runs.map((r) => r.period_start))].sort();
  const lastPeriod = months.at(-1) ?? '';
  const open = (runId?: string) => runId ? openByRun?.get(runId) ?? s.exceptions.filter((e) => e.run_id === runId && !e.disposition).length : 0;
  const controls = s.controls.map((c) => {
    const runs = s.runs.filter((r) => r.control_id === c.control_id);
    const last = runs.find((r) => r.period_start === lastPeriod);
    const automated = !!c.exception_sql;
    return {
      ...c, automated, last,
      trend: months.map((m) => runs.find((r) => r.period_start === m)?.exception_count ?? null),
      open: open(last?.run_id),
      status: !automated ? 'Sampled' as const : (last?.exception_count ?? 0) > 0 ? 'Exceptions' as const : 'Pass' as const,
    };
  });
  const auto = controls.filter((c) => c.automated);
  return {
    months, controls,
    kpis: {
      automated: auto.length, total: controls.length, lastPeriod,
      tested: auto.reduce((a, c) => a + (c.last?.population_count ?? 0), 0),
      sampledBefore: auto.reduce((a, c) => a + c.prior_sample_size, 0),
      open: auto.reduce((a, c) => a + c.open, 0),
    },
  };
}

// Access controls are point-in-time, so each month re-finds the same open entitlements; the queue
// keeps only the latest month for those. Other controls keep every month's open exceptions.
function openQueueRows(s: Snapshot): ExceptionRow[] {
  const latest = new Map<string, string>();
  for (const r of s.runs) if (!latest.has(r.control_id) || latest.get(r.control_id)! < r.period_start) latest.set(r.control_id, r.period_start);
  return s.exceptions.filter((e) => !e.disposition && (!e.control_id.startsWith('AC-') || e.period_start === latest.get(e.control_id)));
}

export function queue(s: Snapshot, now = Date.now()): Omit<Queue, 'source'> {
  const groups = new Map<string, Cluster>();
  const name = new Map(s.controls.map((c) => [c.control_id, c.control_name]));
  for (const e of openQueueRows(s)) {
    const key = `${e.control_id}|${e.period_start}|${e.cluster_key}`;
    let g = groups.get(key);
    if (!g) {
      const anomaly = s.feedQuality.find((f) => f.feed_batch_id === e.cluster_key && f.metric === 'APPROVER_2_NULL_PCT' && f.is_anomaly);
      g = { key, control_id: e.control_id, control_name: name.get(e.control_id) ?? e.control_id, cluster_key: e.cluster_key, period_start: e.period_start,
        severity: 'Medium', count: 0, ageDays: Math.max(0, Math.floor((now - monthEnd(e.period_start).getTime()) / DAY)), anomaly, ids: [] };
      groups.set(key, g);
    }
    g.count++; g.ids.push(e.exception_id);
    if (e.severity === 'High') g.severity = 'High';
  }
  const clusters = [...groups.values()].sort((a, b) => b.count - a.count || (a.severity === 'High' ? -1 : 1) || b.ageDays - a.ageDays);
  return { clusters, total: clusters.reduce((a, c) => a + c.count, 0) };
}

export function exceptionDetail(s: Snapshot, id: string): Omit<ExceptionDetail, 'source'> | null {
  const exception = s.exceptions.find((e) => e.exception_id === id);
  if (!exception) return null;
  const control = s.controls.find((c) => c.control_id === exception.control_id)!;
  return {
    exception, control, run: s.runs.find((r) => r.run_id === exception.run_id),
    clusterSize: s.exceptions.filter((e) => e.run_id === exception.run_id && e.cluster_key === exception.cluster_key).length,
    feed: control.source_table === 'SRC.WIRE_PAYMENTS' ? s.feedQuality.filter((f) => f.period_start === exception.period_start && f.metric === 'APPROVER_2_NULL_PCT') : [],
  };
}

export function evidence(s: Snapshot, period?: string): Omit<Evidence, 'source'> {
  const periods = [...new Set(s.runs.map((r) => r.period_start))].sort().reverse();
  const p = period && periods.includes(period) ? period : periods[0];
  const runs: EvidenceRun[] = s.runs.filter((r) => r.period_start === p).map((r) => {
    const c = s.controls.find((x) => x.control_id === r.control_id)!;
    const by = new Map<string, { count: number; reviewers: Set<string> }>();
    for (const e of s.exceptions.filter((x) => x.run_id === r.run_id)) {
      const k = e.disposition ?? 'Open';
      const v = by.get(k) ?? { count: 0, reviewers: new Set<string>() };
      v.count++; if (e.disposed_by) v.reviewers.add(e.disposed_by);
      by.set(k, v);
    }
    return { ...r, control_name: c.control_name, source_table: c.source_table, exception_sql: c.exception_sql,
      dispositions: [...by].map(([disposition, v]) => ({ disposition, count: v.count, reviewers: [...v.reviewers] })) };
  });
  return { periods, period: p, runs, feed: s.feedQuality.filter((f) => f.period_start === p) };
}

/** The Time Travel query that recounts a source table as of a run. */
export const recountSql = (table: string, runTs: string) => `SELECT COUNT(*) FROM CONTROL_TESTING_DEMO.${table}\n  AT(TIMESTAMP => '${runTs}'::TIMESTAMP_LTZ);`;
