// Sample mode: the bundled snapshot in lib/sample/data.json, exported from a live run of sql/setup.sql.
// AI outputs are the ones captured live (classification, similarity, agent) or scripted (explanations),
// and every screen labels them "Sample AI response". Dispositions and triage decisions are kept in
// memory for the session only.
import raw from './sample/data.json';
import { coverage, evidence, exceptionDetail, queue, recountSql } from './build';
import type { CctData } from './cct-data';
import { SAMPLE_DELAY_MS } from './sample-timing';
import type { Disposition, ExceptionRow, Snapshot, TriageDecision, WorkItemRow } from './types';

type Raw = Snapshot & {
  workItems: WorkItemRow[]; classify: Record<string, string>;
  similar: Record<string, { id: string; score: number }[]>; agent: Record<string, { text: string; tools: string[] }>;
};
const data = raw as unknown as Raw;
const snap: Snapshot = { controls: data.controls, runs: data.runs, exceptions: data.exceptions.map((e) => ({ ...e })), feedQuality: data.feedQuality };
const decisions: TriageDecision[] = [];
const items: WorkItemRow[] = data.workItems.map((w) => ({ ...w }));
const SOURCE_ROWS: Record<string, number> = { 'SRC.USER_ACCESS': 2839, 'SRC.WIRE_PAYMENTS': 14330, 'SRC.LOAN_FILES': 3000, 'SRC.CHANGE_TICKETS': 1852 };
const ACTOR = 'SAMPLE_USER';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mock = { source: 'mock' as const };

function scriptedExplanation(e: ExceptionRow): { text: string; suggestion: Disposition } {
  const d = e.detail as Record<string, string | number | null>;
  const feed = snap.feedQuality.find((f) => f.feed_batch_id === e.cluster_key && f.metric === 'APPROVER_2_NULL_PCT');
  if (e.control_id === 'PY-01' && feed?.is_anomaly) return { suggestion: 'Data issue', text:
    `Wire ${e.record_id} (${Number(d.amount_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}) shows no second approver, but it arrived in feed batch **${e.cluster_key}**, where the second-approver field is blank on **${feed.metric_value}%** of large wires against a baseline of ${feed.baseline_value}%. The other batches that month look normal.\n\nThis points to a feed defect rather than a missed approval. Confirm against the payments platform audit log, ask Data Engineering to reload the batch, and rerun PY-01 before closing.` };
  switch (e.control_id) {
    case 'AC-01': return { suggestion: 'True issue', text: `${d.employee_name} (${d.department}) was terminated on ${d.term_date} and still holds **${d.entitlement}** ${d.days_since_termination} days later. The feed for this system shows no quality problems, so the control failed.\n\nRoute to Identity & Access Management to revoke the entitlement and review activity since the termination date.` };
    case 'PY-02': return { suggestion: 'True issue', text: `Wire ${e.record_id} for ${Number(d.amount_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} is above the initiator's ${Number(d.initiator_limit_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} limit, and **${d.initiated_by}** both initiated and approved it. Self-approval is always a true issue under the PY-02 procedure.\n\nRoute to Payments Operations and notify Operational Risk the same day.` };
    case 'PY-01': return { suggestion: 'True issue', text: `Wire ${e.record_id} is over $250,000 with only one approver, and its feed batch looks normal. Treat it as a missed second approval and route it to Payments Operations.` };
    default: return { suggestion: 'True issue', text: `Record ${e.record_id} fails ${e.control_id}. The evidence row shows the condition the control tests for, and nothing suggests the source data is wrong. Route it to the control owner for remediation, or record an accepted risk with the approval note.` };
  }
}

export const mockData: CctData = {
  async coverage() { return { ...mock, ...coverage(snap) }; },
  async queue() { return { ...mock, ...queue(snap) }; },
  async exception(id) { const d = exceptionDetail(snap, id); return d && { ...mock, ...d }; },
  async explain(id) {
    await wait(SAMPLE_DELAY_MS.explain);
    const e = snap.exceptions.find((x) => x.exception_id === id);
    if (!e) throw new Error('Exception not found');
    return { ...mock, ...scriptedExplanation(e) };
  },
  async dispose(ids, disposition, note) {
    let updated = 0;
    for (const e of snap.exceptions) if (ids.includes(e.exception_id) && !e.disposition) {
      Object.assign(e, { disposition, disposition_note: note, disposed_by: ACTOR, disposed_ts: new Date().toISOString() }); updated++;
    }
    return { updated };
  },
  async backlog() { return { ...mock, items, decisions }; },
  async triage(id, step) {
    await wait(SAMPLE_DELAY_MS[step]);
    if (step === 'classify') return { ...mock, step, label: data.classify[id] };
    if (step === 'duplicates') return { ...mock, step, matches: (data.similar[id] ?? []).map((m) => ({ ...m, title: items.find((w) => w.work_item_id === m.id)?.title ?? m.id })) };
    const a = data.agent[id];
    return { ...mock, step, text: a?.text ?? '', tools: a?.tools ?? [], route: a?.text.match(/Route:\s*(.+)\s*$/m)?.[1]?.trim() };
  },
  async decide(d) {
    decisions.push({ ...d, actor: ACTOR, ts: new Date().toISOString() });
    const w = items.find((x) => x.work_item_id === d.work_item_id);
    if (w && d.decision !== 'Rejected') {
      if (d.step === 'agent') Object.assign(w, { status: 'Routed', routed_team: d.final.match(/Route:\s*(.+)\s*$/m)?.[1]?.trim() ?? null, response: d.final, updated_by: ACTOR });
      if (d.step === 'duplicates' && d.final) Object.assign(w, { status: `Duplicate of ${d.final}`, updated_by: ACTOR });
    }
    return { ok: true };
  },
  async evidence(period) { return { ...mock, ...evidence(snap, period) }; },
  async recount(runId) {
    await wait(SAMPLE_DELAY_MS.recount);
    const r = snap.runs.find((x) => x.run_id === runId);
    const c = r && snap.controls.find((x) => x.control_id === r.control_id);
    if (!r || !c?.source_table) throw new Error('Run not found');
    return { ...mock, table: c.source_table, asOf: r.run_ts, rows: SOURCE_ROWS[c.source_table], sql: recountSql(c.source_table, r.run_ts) };
  },
};
