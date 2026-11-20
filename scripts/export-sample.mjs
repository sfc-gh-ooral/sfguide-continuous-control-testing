// Exports the bundled sample data (lib/sample/data.json) from a live run of sql/setup.sql, so
// Sample mode shows the same results Live mode computes. AI outputs captured here are shown in
// Sample mode with a "Sample AI response" label. Needs the .env.local Live-mode settings.
import { readFileSync, writeFileSync } from 'node:fs';
import snowflake from 'snowflake-sdk';

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2]; }
snowflake.configure({ logLevel: 'ERROR' });
const conn = snowflake.createConnection({ account: process.env.SNOWFLAKE_ACCOUNT, username: process.env.SNOWFLAKE_USERNAME, authenticator: 'SNOWFLAKE_JWT',
  privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH, role: 'CCT_DEMO_ROLE', warehouse: 'CCT_WH', database: 'CONTROL_TESTING_DEMO', schema: 'CTRL' });
await new Promise((r, j) => conn.connect((e) => (e ? j(e) : r())));
const q = (s, b = []) => new Promise((r, j) => conn.execute({ sqlText: s, binds: b, complete: (e, st, rows) => (e ? j(e) : r(rows)) }));
const lower = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v instanceof Date ? v.toISOString() : v])));

const out = {};
out.controls = lower(await q(`SELECT c.control_id, c.control_name, c.domain, c.frequency, c.test_method, c.prior_sample_size, c.last_sample_exceptions,
  c.population_sql, c.exception_sql, c.source_table, o.owner_name, o.team FROM CONTROLS c JOIN CONTROL_OWNERS o USING (owner_id) ORDER BY c.control_id`));
out.runs = lower(await q(`SELECT run_id, control_id, TO_VARCHAR(period_start) period_start, population_count, exception_count, query_id,
  TO_VARCHAR(run_ts, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') run_ts, run_by, trigger_type FROM TEST_RUNS ORDER BY control_id, period_start`));
out.exceptions = lower(await q(`SELECT e.exception_id, e.run_id, e.control_id, TO_VARCHAR(e.period_start) period_start, e.record_id, e.cluster_key, e.severity, e.detail::VARCHAR detail
  FROM EXCEPTIONS e
  ORDER BY e.control_id, e.period_start, e.record_id`)).map((e) => ({ ...e, detail: JSON.parse(e.detail) }));
out.feedQuality = lower(await q(`SELECT TO_VARCHAR(period_start) period_start, feed_batch_id, metric, metric_value, baseline_value, is_anomaly FROM FEED_QUALITY ORDER BY 1, 2, 3`));
out.workItems = lower(await q(`SELECT work_item_id, title, description, status, assignee, TO_VARCHAR(created_ts, 'YYYY-MM-DD"T"HH24:MI:SS') created_ts FROM WORK_ITEMS ORDER BY 1`));
out.classify = Object.fromEntries((await q(`SELECT work_item_id, AI_CLASSIFY(title || '. ' || description, ['Control failure','Data quality issue','Evidence request','Question','Enhancement request']):labels[0]::STRING l FROM WORK_ITEMS`)).map((r) => [r.WORK_ITEM_ID, r.L]));
const sims = await q(`SELECT a.work_item_id a, b.work_item_id b, ROUND(AI_SIMILARITY(a.title || '. ' || a.description, b.title || '. ' || b.description), 3) s
  FROM WORK_ITEMS a JOIN WORK_ITEMS b ON a.work_item_id <> b.work_item_id QUALIFY ROW_NUMBER() OVER (PARTITION BY a.work_item_id ORDER BY s DESC) <= 3`);
out.similar = {};
for (const r of sims) (out.similar[r.A] ??= []).push({ id: r.B, score: r.S });
out.agent = {};
for (const w of out.workItems) {
  const body = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: `Ticket ${w.work_item_id}: ${w.title}. ${w.description}` }] }] });
  const rows = await q('SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(?, ?, TRUE)::VARCHAR AS R', ['CONTROL_TESTING_DEMO.CTRL.TRIAGE_AGENT', body]);
  const content = JSON.parse(rows[0].R).content ?? [];
  out.agent[w.work_item_id] = {
    text: content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim(),
    tools: [...new Set(content.filter((c) => c.type === 'tool_use').map((c) => c.tool_use?.name).filter(Boolean))],
  };
  console.log(w.work_item_id, out.agent[w.work_item_id].tools.join(','));
}
// Never ship the account's user name in the sample.
for (const r of out.runs) r.run_by = 'CONTROL_TESTER';
writeFileSync('lib/sample/data.json', JSON.stringify(out).replaceAll(process.env.SNOWFLAKE_USERNAME.toUpperCase(), 'CONTROL_TESTER'));
console.log('wrote lib/sample/data.json', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])));
process.exit(0);
