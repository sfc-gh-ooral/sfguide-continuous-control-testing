'use client';

// Triage assistant: the intake backlog. For each ticket an orchestrator runs three steps —
// classify (AI_CLASSIFY), find duplicates (AI_SIMILARITY) and investigate + draft + route (Cortex
// Agent with Analyst, Search and procedure tools). Every step waits for Approve, Edit or Reject.
import { Bot, Check, Copy, Pencil, Play, Tags, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AiCard } from '@/components/AiPanel';
import { ErrorState, Kpi, PageSkeleton, Pill, PoweredBy, Sheet, Source } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import type { TriageDecision, TriageResult, TriageStep, WorkItemRow } from '@/lib/types';

const CATEGORIES = ['Control failure', 'Data quality issue', 'Evidence request', 'Question', 'Enhancement request'];
const catTone = (l?: string): 'pen' | 'feed' | 'tick' | 'waive' | 'ai' => l === 'Control failure' ? 'pen' : l === 'Data quality issue' ? 'feed' : l === 'Evidence request' ? 'tick' : l === 'Enhancement request' ? 'waive' : 'ai';
const TOOL_LABEL: Record<string, string> = { exceptions_analyst: 'Cortex Analyst · EXCEPTIONS_SV', procedures_search: 'Cortex Search · procedures',
  check_feed_quality: 'Tool · CHECK_FEED_QUALITY (DMF results)', lookup_table_metadata: 'Tool · LOOKUP_TABLE_METADATA', system_execute_sql: 'Cortex Analyst · SQL run' };

// The agent sometimes writes a planning line before its answer; show the answer from "Finding:" on.
const clean = (t?: string) => { const i = t?.indexOf('**Finding') ?? -1; return (i > 0 ? t!.slice(i) : t ?? '').trim(); };

const META: Record<TriageStep, { n: number; title: string; powered: string; steps: (w: WorkItemRow) => string[] }> = {
  classify: { n: 1, title: 'Classify the ticket', powered: 'Cortex AI_CLASSIFY', steps: () => ['Reading title and description…', 'Scoring 5 intake categories…'] },
  duplicates: { n: 2, title: 'Find duplicates', powered: 'Cortex AI_SIMILARITY', steps: () => ['Comparing with 19 other intake tickets…', 'Ranking by semantic similarity…'] },
  agent: { n: 3, title: 'Investigate, draft and route', powered: 'Cortex Agent', steps: (w) => [`Planning how to answer ${w.work_item_id}…`, 'Querying exceptions with Cortex Analyst…', 'Searching control procedures…', 'Checking feed quality and table metadata…', 'Drafting response and route…'] },
};

function StepCard({ w, step, decision, onDecide }: { w: WorkItemRow; step: TriageStep; decision?: TriageDecision; onDecide: (d: TriageDecision['decision'], final: string) => Promise<void> }) {
  const m = META[step];
  const [r, setR] = useState<TriageResult>(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string>();
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(''); const [saving, setSaving] = useState(false);
  const run = async () => { setBusy(true); setErr(undefined); try { setR(await data.triage(w.work_item_id, step)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const proposed = !r ? '' : step === 'classify' ? r.label ?? '' : step === 'duplicates' ? '' : clean(r.text);
  const decide = async (d: TriageDecision['decision'], final: string) => { setSaving(true); try { await onDecide(d, final); setEditing(false); } finally { setSaving(false); } };
  const text = !r ? undefined : step === 'classify' ? `Category: **${r.label}**`
    : step === 'duplicates' ? (r.matches ?? []).map((x) => `**${x.id}** · ${x.score.toFixed(2)} · ${x.title}`).join('\n\n') + '\n\nRanked by semantic similarity. Similarity alone does not prove a duplicate here, so choose the original with **Edit**, or approve as not a duplicate.'
    : clean(r.text);

  return (
    <div className="relative pl-9">
      <span className={`absolute left-0 top-2 w-6 h-6 rounded-full grid place-items-center text-[12px] font-semibold border ${decision ? 'bg-tick text-on-ink border-tick' : 'bg-sheet border-rule'}`}>{decision ? <Check className="w-3.5 h-3.5" aria-hidden /> : m.n}</span>
      <AiCard title={m.title} busy={busy} result={r} text={text} steps={m.steps(w)} powered={<PoweredBy>{m.powered}</PoweredBy>}
        sources={step === 'agent' ? (r?.tools ?? []).map((t) => ({ label: TOOL_LABEL[t] ?? t })) : undefined}
        idle={<div className="flex items-center gap-2"><button className="btn btn-ink btn-sm" onClick={run}><Play className="w-3.5 h-3.5" aria-hidden />Run step</button>
          {err && <span role="alert" className="text-[12px] text-pen">{err}</span>}</div>}
        footer={decision ? (
          <div className="flex items-center gap-2 text-[12.5px] flex-wrap"><span className={`stamp ${decision.decision === 'Rejected' ? 'text-pen' : 'text-tick'}`}>{decision.decision}</span>
            <span className="text-muted">by {decision.actor} · {decision.final ? (step === 'agent' ? (decision.final.match(/Route:\s*(.+)$/m)?.[1] ?? 'response saved') : decision.final) : 'no change'}</span></div>
        ) : editing ? (
          <div className="space-y-2">
            {step === 'classify' ? <select value={draft} onChange={(e) => setDraft(e.target.value)} className="rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px]" aria-label="Category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              : step === 'duplicates' ? <select value={draft} onChange={(e) => setDraft(e.target.value)} className="rounded-md border border-rule bg-sheet px-2 py-1.5 text-[13px]" aria-label="Duplicate of"><option value="">Not a duplicate</option>{r?.matches?.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.title}</option>)}</select>
              : <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[13px]" aria-label="Edit draft response" />}
            <div className="flex gap-2"><button className="btn btn-ink btn-sm" disabled={saving} onClick={() => decide('Edited', draft)}>Save edit</button><button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-sm !border-tick text-tick" disabled={saving} onClick={() => decide('Approved', proposed)}><Check className="w-3.5 h-3.5" aria-hidden />Approve</button>
            <button className="btn btn-sm" onClick={() => { setDraft(proposed); setEditing(true); }}><Pencil className="w-3.5 h-3.5" aria-hidden />Edit</button>
            <button className="btn btn-sm !border-pen/50 text-pen" disabled={saving} onClick={() => decide('Rejected', '')}><X className="w-3.5 h-3.5" aria-hidden />Reject</button>
          </div>
        )} />
    </div>
  );
}

export default function TriagePage() {
  const b = useAsync(() => data.backlog(), [], { keep: true });
  const [picked, setSel] = useState<string>();
  const [local, setDecisions] = useState<TriageDecision[]>();
  const decisions = useMemo(() => local ?? b.data?.decisions ?? [], [local, b.data]);
  const items = b.data?.items ?? [];
  const sel = picked ?? items[0]?.work_item_id;
  const w = items.find((x) => x.work_item_id === sel);
  const dec = useMemo(() => new Map(decisions.map((d) => [`${d.work_item_id}|${d.step}`, d])), [decisions]);
  if (b.error) return <ErrorState error={b.error} retry={b.reload} />;
  if (!b.data) return <PageSkeleton />;
  const routed = items.filter((x) => x.status === 'Routed').length;
  const dups = items.filter((x) => x.status.startsWith('Duplicate')).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap rise">
        <div>
          <div className="eyebrow">Triage assistant</div>
          <h1 className="cond text-[28px] leading-tight mt-0.5">Intake backlog, triaged with a person on every step</h1>
          <p className="text-muted text-[13.5px] mt-1 max-w-2xl">The orchestrator classifies each ticket, links duplicates, looks up the facts and drafts a reply with a route. Nothing is routed until you approve it.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap"><PoweredBy>Cortex Agents</PoweredBy><Source p={b.data} /></div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <Kpi label="Tickets in intake" value={items.length} icon={<Tags className="w-4 h-4" />} />
        <Kpi label="Awaiting triage" value={items.filter((x) => x.status === 'Open').length} />
        <Kpi label="Linked as duplicates" value={dups} icon={<Copy className="w-4 h-4" />} />
        <Kpi label="Routed after approval" value={routed} icon={<Bot className="w-4 h-4" />} deltaTone="tick" delta={decisions.length ? `${decisions.length}` : undefined} note={decisions.length ? 'decisions logged' : 'none yet'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <Sheet pad={false} className="lg:col-span-2 rise" title="Backlog" eyebrow={`${items.length} tickets`}>
          <ul className="max-h-[720px] overflow-y-auto divide-y divide-[var(--rule)]">
            {items.map((x) => (
              <li key={x.work_item_id}>
                <button onClick={() => setSel(x.work_item_id)} aria-current={sel === x.work_item_id}
                  className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${sel === x.work_item_id ? 'bg-sheet-2 border-pen' : 'border-transparent hover:bg-sheet-2'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11.5px] text-muted">{x.work_item_id}</span>
                    <span className="flex gap-1">{['classify', 'duplicates', 'agent'].map((s) => <span key={s} className={`w-1.5 h-1.5 rounded-full ${dec.has(`${x.work_item_id}|${s}`) ? 'bg-tick' : 'bg-rule'}`} />)}</span></div>
                  <div className="font-medium text-[13px] mt-0.5">{x.title}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Pill tone={x.status === 'Routed' ? 'tick' : x.status.startsWith('Duplicate') ? 'waive' : 'muted'}>{x.status}</Pill>
                    {dec.get(`${x.work_item_id}|classify`)?.final && <Pill tone={catTone(dec.get(`${x.work_item_id}|classify`)!.final)}>{dec.get(`${x.work_item_id}|classify`)!.final}</Pill>}
                    {x.routed_team && <span className="text-[11.5px] text-muted">→ {x.routed_team}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>

        {w && (
          <div key={w.work_item_id} className="lg:col-span-3 space-y-3 drawer">
            <Sheet eyebrow={`${w.work_item_id} · opened ${new Date(w.created_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`} title={w.title}>
              <p className="text-[13.5px]">{w.description}</p>
            </Sheet>
            {(['classify', 'duplicates', 'agent'] as TriageStep[]).map((s) => (
              <StepCard key={s} w={w} step={s} decision={dec.get(`${w.work_item_id}|${s}`)} onDecide={async (d, final) => {
                await data.decide({ work_item_id: w.work_item_id, step: s, decision: d, final });
                const fresh = await data.backlog();
                setDecisions(fresh.decisions.length ? fresh.decisions : [...decisions, { work_item_id: w.work_item_id, step: s, decision: d, final, actor: 'you', ts: new Date().toISOString() }]);
                b.reload();
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// bg-pen-soft text-pen bg-feed-soft text-feed bg-tick-soft text-tick bg-waive-soft text-waive bg-ai-soft text-ai
