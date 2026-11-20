// Shapes shared by Sample mode (bundled JSON) and Live mode (Snowflake). Column names match sql/setup.sql.
export interface Provenance { source: 'mock' | 'snowflake'; role?: string; latencyMs?: number }

export interface ControlRow {
  control_id: string; control_name: string; domain: string; frequency: string; test_method: string;
  prior_sample_size: number; last_sample_exceptions: number; population_sql: string | null; exception_sql: string | null;
  source_table: string | null; owner_name: string; team: string;
}
export interface RunRow {
  run_id: string; control_id: string; period_start: string; population_count: number; exception_count: number;
  query_id: string; run_ts: string; run_by: string; trigger_type: string;
}
export interface ExceptionRow {
  exception_id: string; run_id: string; control_id: string; period_start: string; record_id: string;
  cluster_key: string; severity: 'High' | 'Medium' | string; detail: Record<string, unknown>;
  disposition?: Disposition | null; disposition_note?: string | null; disposed_by?: string | null; disposed_ts?: string | null;
}
export interface FeedQualityRow { period_start: string; feed_batch_id: string; metric: string; metric_value: number; baseline_value: number | null; is_anomaly: boolean }
export interface WorkItemRow {
  work_item_id: string; title: string; description: string; status: string; assignee: string | null; created_ts: string;
  routed_team?: string | null; response?: string | null; updated_by?: string | null;
}
export type Disposition = 'True issue' | 'Data issue' | 'Accepted risk';
export const DISPOSITIONS: Disposition[] = ['True issue', 'Data issue', 'Accepted risk'];

/** Everything the screens are computed from. */
export interface Snapshot { controls: ControlRow[]; runs: RunRow[]; exceptions: ExceptionRow[]; feedQuality: FeedQualityRow[] }

export interface CoverageControl extends ControlRow {
  automated: boolean; last?: RunRow; trend: (number | null)[]; open: number; status: 'Pass' | 'Exceptions' | 'Sampled';
}
export interface Coverage extends Provenance {
  months: string[]; controls: CoverageControl[];
  kpis: { automated: number; total: number; tested: number; sampledBefore: number; open: number; lastPeriod: string };
  /** Feed batches the data metric functions flagged, by month (shown on the heatmap). */
  anomalies: { period_start: string; feed_batch_id: string; metric_value: number; baseline_value: number | null }[];
}
export interface Cluster {
  key: string; control_id: string; control_name: string; cluster_key: string; period_start: string;
  severity: string; count: number; ageDays: number; anomaly?: FeedQualityRow; ids: string[];
}
export interface Queue extends Provenance { clusters: Cluster[]; total: number }
export interface ExceptionDetail extends Provenance {
  exception: ExceptionRow; control: ControlRow; run?: RunRow; clusterSize: number; feed: FeedQualityRow[];
}
export interface AiResult extends Provenance { text: string; suggestion?: Disposition; model?: string }

export type TriageStep = 'classify' | 'duplicates' | 'agent';
export interface TriageResult extends Provenance {
  step: TriageStep; label?: string; matches?: { id: string; title: string; score: number }[];
  text?: string; route?: string; tools?: string[];
}
export interface TriageDecision { work_item_id: string; step: TriageStep; decision: 'Approved' | 'Edited' | 'Rejected'; final: string; actor: string; ts: string }
export interface Backlog extends Provenance { items: WorkItemRow[]; decisions: TriageDecision[] }

export interface EvidenceRun extends RunRow {
  control_name: string; source_table: string | null; exception_sql: string | null;
  dispositions: { disposition: string; count: number; reviewers: string[] }[];
}
export interface Evidence extends Provenance { periods: string[]; period: string; runs: EvidenceRun[]; feed: FeedQualityRow[] }
export interface TaskRun extends Provenance { task: string; state: string; queryId?: string; scheduledFor: string; durationMs: number; result?: string; error?: string }
export interface Recount extends Provenance { table: string; asOf: string; rows: number; queryId?: string; sql: string }
