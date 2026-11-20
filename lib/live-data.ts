// Live mode: reads and writes CONTROL_TESTING_DEMO with CCT_DEMO_ROLE. Coverage reads the
// EXCEPTION_ROLLUP Dynamic Table and can run the MONTHLY_CONTROL_TESTS task on demand, AI explanations use AI_COMPLETE, triage uses AI_CLASSIFY,
// AI_SIMILARITY, and the TRIAGE_AGENT Cortex Agent, and the evidence recount uses Time Travel.
// Latency shown in the UI is measured here.
import { coverage, evidence, exceptionDetail, queue, recountSql } from './build';
import type { CctData } from './cct-data';
import { ROLE, exec, query } from './snowflake';
import { DISPOSITIONS, type ControlRow, type ExceptionRow, type FeedQualityRow, type RunRow, type Snapshot, type TriageStep, type WorkItemRow } from './types';

const AGENT = process.env.SNOWFLAKE_AGENT_NAME ?? 'CONTROL_TESTING_DEMO.CTRL.TRIAGE_AGENT';
const MODEL = process.env.SNOWFLAKE_COMPLETE_MODEL ?? 'claude-sonnet-4-5';
const CATEGORIES = ['Control failure', 'Data quality issue', 'Evidence request', 'Question', 'Enhancement request'];
// Each control's source table, as a constant: the recount never builds SQL from a stored name.
const SOURCE_TABLE: Record<string, string> = { 'SRC.USER_ACCESS': 'SRC.USER_ACCESS', 'SRC.WIRE_PAYMENTS': 'SRC.WIRE_PAYMENTS', 'SRC.LOAN_FILES': 'SRC.LOAN_FILES', 'SRC.CHANGE_TICKETS': 'SRC.CHANGE_TICKETS' };
const TASK = 'MONTHLY_CONTROL_TESTS';

type Row = Record<string, unknown>;
const lower = <T>(rows: Row[]): T[] => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])) as T);
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> { const t0 = Date.now(); const r = await fn(); return [r, Date.now() - t0]; }
const live = (latencyMs: number) => ({ source: 'snowflake' as const, role: ROLE, latencyMs });

const RUNS_SQL = `SELECT run_id, control_id, TO_VARCHAR(period_start) period_start, population_count, exception_count, query_id,
  TO_VARCHAR(run_ts, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') run_ts, run_by, trigger_type FROM TEST_RUNS
  QUALIFY ROW_NUMBER() OVER (PARTITION BY control_id, period_start ORDER BY run_ts DESC) = 1`;

async function snapshot(opts: { exceptions?: 'all' | 'none' } = {}): Promise<Snapshot> {
  const [controls, runs, exceptions, feedQuality] = await Promise.all([
    query(`SELECT c.control_id, c.control_name, c.domain, c.frequency, c.test_method, c.prior_sample_size, c.last_sample_exceptions,
      c.population_sql, c.exception_sql, c.source_table, o.owner_name, o.team FROM CONTROLS c JOIN CONTROL_OWNERS o USING (owner_id) ORDER BY c.control_id`),
    query(RUNS_SQL),
    opts.exceptions === 'none' ? Promise.resolve([]) : query(`SELECT e.exception_id, e.run_id, e.control_id, TO_VARCHAR(e.period_start) period_start, e.record_id,
      e.cluster_key, e.severity, e.detail::VARCHAR detail, e.disposition, e.disposition_note, e.disposed_by, TO_VARCHAR(e.disposed_ts) disposed_ts
      FROM EXCEPTIONS e JOIN (${RUNS_SQL}) r USING (run_id)`),
    query(`SELECT TO_VARCHAR(period_start) period_start, feed_batch_id, metric, metric_value, baseline_value, is_anomaly FROM FEED_QUALITY`),
  ]);
  return {
    controls: lower<ControlRow>(controls), runs: lower<RunRow>(runs), feedQuality: lower<FeedQualityRow>(feedQuality),
    exceptions: lower<ExceptionRow & { detail: string }>(exceptions).map((e) => ({ ...e, detail: JSON.parse(e.detail as unknown as string) })),
  };
}

async function workItem(id: string): Promise<WorkItemRow> {
  const [w] = lower<WorkItemRow>(await query('SELECT * FROM WORK_ITEMS WHERE work_item_id = ?', [id]));
  if (!w) throw new Error('Work item not found');
  return w;
}

export const liveData: CctData = {
  async coverage() {
    // Open counts come from the EXCEPTION_ROLLUP Dynamic Table.
    const [[s, rollup], ms] = await timed(() => Promise.all([snapshot({ exceptions: 'none' }), query<{ RUN_ID: string; OPEN_EXCEPTIONS: number }>('SELECT run_id, open_exceptions FROM EXCEPTION_ROLLUP')]));
    return { ...live(ms), ...coverage(s, new Map(rollup.map((r) => [r.RUN_ID, Number(r.OPEN_EXCEPTIONS)]))) };
  },
  async queue() { const [s, ms] = await timed(() => snapshot()); return { ...live(ms), ...queue(s) }; },
  async exception(id) { const [s, ms] = await timed(() => snapshot()); const d = exceptionDetail(s, id); return d && { ...live(ms), ...d }; },

  async explain(id) {
    const [rows, ms] = await timed(async () => {
      const [e] = await query<Row>(`SELECT TO_VARCHAR(CURRENT_DATE()) today, e.control_id, c.control_name, e.record_id, e.cluster_key, e.detail::VARCHAR detail, p.body procedure_text,
          (SELECT LISTAGG(feed_batch_id || ' approver_2 null ' || metric_value || '% (baseline ' || baseline_value || '%)' || IFF(is_anomaly, ' ANOMALY', ''), '; ')
             FROM FEED_QUALITY f WHERE f.period_start = e.period_start AND f.metric = 'APPROVER_2_NULL_PCT' AND c.source_table = 'SRC.WIRE_PAYMENTS') feed
        FROM EXCEPTIONS e JOIN CONTROLS c USING (control_id) LEFT JOIN CONTROL_PROCEDURES p ON p.control_id = e.control_id
        WHERE e.exception_id = ?`, [id]);
      if (!e) throw new Error('Exception not found');
      const prompt = `You review control test exceptions for a bank's second line of defense. Using only the facts below, explain in under 110 words why this record failed the control and whether it is more likely a real control failure or a problem with the source data. Dates on or before today are in the past. Do not speculate about people or motives. Recommend a next step. End with one line exactly "Suggested disposition: <True issue|Data issue|Accepted risk>".\n\nToday: ${e.TODAY}\nControl: ${e.CONTROL_ID} ${e.CONTROL_NAME}\nProcedure: ${e.PROCEDURE_TEXT ?? 'n/a'}\nRecord: ${e.RECORD_ID} (group ${e.CLUSTER_KEY})\nEvidence row: ${e.DETAIL}\nFeed quality for the month: ${e.FEED ?? 'not measured for this source'}`;
      return query<{ R: string }>('SELECT AI_COMPLETE(?, ?) AS R', [MODEL, prompt]);
    });
    const text = String(rows[0]?.R ?? '').trim();
    const sug = text.match(/Suggested disposition:\s*(True issue|Data issue|Accepted risk)/i)?.[1];
    return { ...live(ms), model: MODEL, text: text.replace(/\n?Suggested disposition:.*$/i, '').trim(), suggestion: DISPOSITIONS.find((d) => d.toLowerCase() === sug?.toLowerCase()) };
  },

  async dispose(ids, disposition, note) {
    if (!DISPOSITIONS.includes(disposition)) throw new Error('Unknown disposition');
    if (!note.trim()) throw new Error('A note is required');
    if (!ids.length || ids.length > 500) throw new Error('Select between 1 and 500 exceptions');
    const marks = ids.map(() => '?').join(',');
    const { rows } = await exec<{ 'number of rows updated': number }>(`UPDATE EXCEPTIONS SET disposition = ?, disposition_note = ?, disposed_by = CURRENT_USER(), disposed_ts = CURRENT_TIMESTAMP()
      WHERE disposition IS NULL AND exception_id IN (${marks})`, [disposition, note, ...ids]);
    await query(`INSERT INTO DISPOSITION_LOG SELECT exception_id, disposition, disposition_note, disposed_by, disposed_ts FROM EXCEPTIONS
      WHERE exception_id IN (${marks}) AND disposed_ts >= DATEADD(minute, -1, CURRENT_TIMESTAMP())`, ids);
    await query('ALTER DYNAMIC TABLE EXCEPTION_ROLLUP REFRESH');
    return { updated: Number(rows[0]?.['number of rows updated'] ?? 0) };
  },

  async backlog() {
    const [[items, decisions], ms] = await timed(() => Promise.all([
      query(`SELECT work_item_id, title, description, status, assignee, TO_VARCHAR(created_ts, 'YYYY-MM-DD"T"HH24:MI:SS') created_ts, routed_team, response, updated_by
             FROM WORK_ITEMS WHERE source = 'Intake' ORDER BY work_item_id`),
      query(`SELECT work_item_id, step, decision, final_output final, actor, TO_VARCHAR(ts) ts FROM TRIAGE_LOG ORDER BY ts`),
    ]));
    return { ...live(ms), items: lower(items), decisions: lower(decisions) };
  },

  async triage(id, step: TriageStep) {
    const w = await workItem(id);
    const text = `${w.title}. ${w.description}`;
    if (step === 'classify') {
      const [rows, ms] = await timed(() => query<{ L: string }>('SELECT AI_CLASSIFY(?, PARSE_JSON(?)):labels[0]::STRING AS L', [text, JSON.stringify(CATEGORIES)]));
      return { ...live(ms), step, label: rows[0]?.L };
    }
    if (step === 'duplicates') {
      const [rows, ms] = await timed(() => query<{ ID: string; TITLE: string; S: number }>(`SELECT work_item_id id, title, ROUND(AI_SIMILARITY(?, title || '. ' || description), 3) s
        FROM WORK_ITEMS WHERE work_item_id <> ? AND source = 'Intake' ORDER BY s DESC LIMIT 3`, [text, id]));
      return { ...live(ms), step, matches: rows.map((r) => ({ id: r.ID, title: r.TITLE, score: Number(r.S) })) };
    }
    const body = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: `Ticket ${w.work_item_id}: ${text}` }] }] });
    const [rows, ms] = await timed(() => query<{ R: string }>('SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(?, ?, TRUE)::VARCHAR AS R', [AGENT, body]));
    const content: Row[] = JSON.parse(rows[0].R).content ?? [];
    const answer = content.filter((c) => c.type === 'text').map((c) => String(c.text)).join('\n').trim();
    const tools = [...new Set(content.filter((c) => c.type === 'tool_use').map((c) => String((c.tool_use as Row | undefined)?.name ?? '')).filter(Boolean))];
    return { ...live(ms), step, text: answer, tools, route: answer.match(/Route:\s*(.+)\s*$/m)?.[1]?.trim() };
  },

  async decide(d) {
    if (!['Approved', 'Edited', 'Rejected'].includes(d.decision) || !['classify', 'duplicates', 'agent'].includes(d.step)) throw new Error('Unknown decision');
    await query('INSERT INTO TRIAGE_LOG (work_item_id, step, decision, final_output, actor, ts) SELECT ?, ?, ?, ?, CURRENT_USER(), CURRENT_TIMESTAMP()',
      [d.work_item_id, d.step, d.decision, d.final.slice(0, 4000)]);
    if (d.decision !== 'Rejected' && d.step === 'agent') {
      const route = d.final.match(/Route:\s*(.+)\s*$/m)?.[1]?.trim() ?? null;
      await query(`UPDATE WORK_ITEMS SET status = 'Routed', routed_team = ?, response = ?, updated_by = CURRENT_USER(), updated_ts = CURRENT_TIMESTAMP() WHERE work_item_id = ?`,
        [route, d.final.slice(0, 4000), d.work_item_id]);
    }
    if (d.decision !== 'Rejected' && d.step === 'duplicates' && d.final) {
      await query(`UPDATE WORK_ITEMS SET status = 'Duplicate of ' || ?, updated_by = CURRENT_USER(), updated_ts = CURRENT_TIMESTAMP() WHERE work_item_id = ?`, [d.final.slice(0, 20), d.work_item_id]);
    }
    return { ok: true };
  },

  async evidence(period) { const [s, ms] = await timed(() => snapshot()); return { ...live(ms), ...evidence(s, period) }; },

  async recount(runId) {
    const [r] = await query<{ SOURCE_TABLE: string; RUN_TS: string }>(`SELECT c.source_table, TO_VARCHAR(t.run_ts, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') run_ts
      FROM TEST_RUNS t JOIN CONTROLS c USING (control_id) WHERE t.run_id = ?`, [runId]);
    const table = r && Object.hasOwn(SOURCE_TABLE, r.SOURCE_TABLE) ? SOURCE_TABLE[r.SOURCE_TABLE] : undefined;
    if (!table) throw new Error('Run not found');
    // The table name is a constant from SOURCE_TABLE; the timestamp is a bind variable.
    const [{ rows, queryId }, ms] = await timed(() => exec<{ N: number }>(`SELECT COUNT(*) AS N FROM ${table} AT(TIMESTAMP => ?::TIMESTAMP_LTZ)`, [r.RUN_TS]));
    return { ...live(ms), table, asOf: r.RUN_TS, rows: Number(rows[0].N), queryId, sql: recountSql(table, r.RUN_TS) };
  },

  async runTests() {
    // Runs the suspended monthly task once, now, then waits for TASK_HISTORY to report how it ended.
    const t0 = Date.now();
    const started = new Date(t0 - 5000).toISOString();
    await query(`EXECUTE TASK CTRL.${TASK}`);
    type H = { STATE: string; QUERY_ID: string; SCHEDULED_TIME: string; RETURN_VALUE: string | null; ERROR_MESSAGE: string | null };
    for (let i = 0; i < 90; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const [h] = await query<H>(`SELECT state, query_id, TO_VARCHAR(scheduled_time, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') scheduled_time, return_value, error_message
        FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(TASK_NAME => ?, SCHEDULED_TIME_RANGE_START => ?::TIMESTAMP_LTZ, RESULT_LIMIT => 5))
        ORDER BY scheduled_time DESC LIMIT 1`, [TASK, started]);
      if (h && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(h.STATE)) {
        if (h.STATE === 'SUCCEEDED') await query('ALTER DYNAMIC TABLE EXCEPTION_ROLLUP REFRESH');
        return { ...live(Date.now() - t0), task: `CTRL.${TASK}`, state: h.STATE, queryId: h.QUERY_ID, scheduledFor: h.SCHEDULED_TIME,
          durationMs: Date.now() - t0, result: h.RETURN_VALUE ?? undefined, error: h.ERROR_MESSAGE ?? undefined };
      }
    }
    throw new Error('The task is still running after 3 minutes; check TASK_HISTORY in Snowsight.');
  },
};
