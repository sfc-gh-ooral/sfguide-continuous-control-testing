// One interface for every screen. lib/mock-data.ts serves the bundled sample; lib/live-data.ts
// queries Snowflake. The API route (and the hosted /try/ build) choose between them.
import type { AiResult, Backlog, Coverage, Disposition, Evidence, ExceptionDetail, Queue, Recount, TaskRun, TriageDecision, TriageResult, TriageStep } from './types';

export interface CctData {
  coverage(): Promise<Coverage>;
  queue(): Promise<Queue>;
  exception(id: string): Promise<ExceptionDetail | null>;
  explain(id: string): Promise<AiResult>;
  dispose(ids: string[], disposition: Disposition, note: string): Promise<{ updated: number }>;
  backlog(): Promise<Backlog>;
  triage(workItemId: string, step: TriageStep): Promise<TriageResult>;
  decide(d: Omit<TriageDecision, 'actor' | 'ts'>): Promise<{ ok: true }>;
  evidence(period?: string): Promise<Evidence>;
  recount(runId: string): Promise<Recount>;
  runTests(): Promise<TaskRun>;
}
