'use client';

// Triage assistant: each intake ticket goes through three AI steps (classify, find duplicates,
// agent investigation with a drafted response and route). A person approves, edits, or rejects
// every step; nothing is routed without that decision.
import { Bot, Check, Pencil, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { ErrorBox, Tag } from '@/components/Status';
import { Card, Markdown, PoweredBy, SampleAiBadge, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import type { TriageDecision, TriageResult, TriageStep, WorkItemRow } from '@/lib/types';

const STEPS: { step: TriageStep; title: string; tech: string }[] = [
  { step: 'classify', title: '1. Classify intake', tech: 'AI_CLASSIFY' },
  { step: 'duplicates', title: '2. Find duplicates', tech: 'AI_SIMILARITY' },
  { step: 'agent', title: '3. Investigate, draft, and route', tech: 'Cortex Agent' },
];
const DUP_THRESHOLD = 0.7;

function summary(r: TriageResult): string {
  if (r.step === 'classify') return r.label ?? '';
  if (r.step === 'duplicates') { const top = r.matches?.[0]; return top && top.score >= DUP_THRESHOLD ? top.id : ''; }
  return r.text ?? '';
}

function StepCard({ item, step, title, tech, decided, onDecided }: { item: WorkItemRow; step: TriageStep; title: string; tech: string; decided?: TriageDecision; onDecided: () => void }) {
  const [res, setRes] = useState<TriageResult>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const run = async () => {
    setBusy(true); setErr(undefined); setRes(undefined);
    try { const r = await data.triage(item.work_item_id, step); setRes(r); setDraft(summary(r)); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };
  const decide = async (decision: TriageDecision['decision']) => {
    await data.decide({ work_item_id: item.work_item_id, step, decision, final: decision === 'Rejected' ? '' : draft });
    setEditing(false); onDecided();
  };

  return (
    <Card title={title} right={res?.source === 'mock' ? <SampleAiBadge /> : res ? <SourceBadge p={res} /> : <PoweredBy>{tech}</PoweredBy>}>
      {decided && (
        <div className="text-sm"><Tag tone={decided.decision === 'Rejected' ? 'bad' : 'good'}>{decided.decision}</Tag> <span className="muted text-xs">by {decided.actor}</span>
          {decided.final && <div className="prose-ai text-sm mt-2"><Markdown text={decided.final} /></div>}
        </div>
      )}
      {!decided && !res && !busy && <button className="btn btn-ai" onClick={run}><Sparkles className="w-4 h-4" aria-hidden />Run step</button>}
      {busy && <Reasoning kind={step} />}
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--negative)' }}>{err}</p>}
      {!decided && res && (
        <div className="space-y-3">
          <div className="ai-panel text-sm">
            {step === 'classify' && <p>Category: <strong>{res.label}</strong></p>}
            {step === 'duplicates' && (
              <ul className="space-y-1">
                {res.matches?.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 flex-wrap">
                    <span className="tabular text-xs w-12">{m.score.toFixed(2)}</span><strong className="text-xs">{m.id}</strong><span className="text-xs text-2">{m.title}</span>
                    {m.score >= DUP_THRESHOLD && <Tag tone="warn">Likely duplicate</Tag>}
                  </li>
                ))}
                {!res.matches?.some((m) => m.score >= DUP_THRESHOLD) && <li className="text-xs muted">No likely duplicates (similarity below {DUP_THRESHOLD}).</li>}
              </ul>
            )}
            {step === 'agent' && (
              <>
                <div className="prose-ai"><Markdown text={res.text ?? ''} /></div>
                {!!res.tools?.length && <p className="text-[11px] muted mt-2">Tools used: {res.tools.join(', ')}</p>}
              </>
            )}
          </div>
          {editing && (
            <label className="block">
              <span className="text-xs muted">{step === 'duplicates' ? 'Duplicate of (ticket ID, blank for none)' : step === 'classify' ? 'Category' : 'Response and route (keep a final "Route: <team>" line)'}</span>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={step === 'agent' ? 8 : 1}
                className="w-full text-sm rounded-lg border px-3 py-1.5 mt-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </label>
          )}
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={() => decide(editing ? 'Edited' : 'Approved')}><Check className="w-4 h-4" aria-hidden />{editing ? 'Save edit' : 'Approve'}</button>
            {!editing && <button className="btn" onClick={() => setEditing(true)}><Pencil className="w-4 h-4" aria-hidden />Edit</button>}
            <button className="btn" onClick={() => decide('Rejected')}><X className="w-4 h-4" aria-hidden />Reject</button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function TriagePage() {
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState('WI-0101');
  const { data: b, error, loading } = useAsync(() => data.backlog(), [reload]);
  if (error) return <ErrorBox error={error} />;
  if (loading) return <Thinking label="Loading backlog" />;
  if (!b) return null;
  const item = b.items.find((i) => i.work_item_id === sel) ?? b.items[0];
  const decided = (step: TriageStep) => [...b.decisions].reverse().find((d) => d.work_item_id === item?.work_item_id && d.step === step);

  return (
    <div className="space-y-5 stagger">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Triage assistant</h1>
          <p className="text-sm text-2 mt-1">{b.items.filter((i) => i.status === 'Open').length} open intake tickets. Every AI step waits for your approval.</p>
        </div>
        <SourceBadge p={b} />
      </div>
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <Card title="Backlog" className="min-w-0">
          <ul className="space-y-1 max-h-[640px] overflow-y-auto -mx-1">
            {b.items.map((i) => (
              <li key={i.work_item_id}>
                <button onClick={() => setSel(i.work_item_id)} aria-pressed={item?.work_item_id === i.work_item_id}
                  className="w-full text-left rounded-lg px-2 py-1.5 text-sm" style={item?.work_item_id === i.work_item_id ? { background: 'var(--accent-soft)' } : undefined}>
                  <div className="flex items-center gap-2"><span className="text-xs muted tabular">{i.work_item_id}</span>
                    <Tag tone={i.status === 'Open' ? 'info' : i.status === 'Routed' ? 'good' : 'muted'}>{i.status}</Tag></div>
                  <div className="truncate">{i.title}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {item && (
          <div className="space-y-3 min-w-0" key={item.work_item_id}>
            <Card title={<span className="flex items-center gap-2"><Bot className="w-4 h-4" aria-hidden />{item.work_item_id}: {item.title}</span>}>
              <p className="text-sm text-2">{item.description}</p>
              <p className="text-xs muted mt-2">Status {item.status}{item.routed_team ? ` · routed to ${item.routed_team}` : ''}{item.assignee ? ` · ${item.assignee}` : ''}</p>
            </Card>
            {STEPS.map((s) => <StepCard key={s.step} item={item} {...s} decided={decided(s.step)} onDecided={() => setReload((r) => r + 1)} />)}
          </div>
        )}
      </div>
    </div>
  );
}
