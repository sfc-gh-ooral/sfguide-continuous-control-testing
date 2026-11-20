# Continuous Control Testing

Help risk and audit teams test entire populations instead of samples, triage exceptions with an AI assistant, and keep evidence for every run.

This is a Snowflake example on **synthetic data**: **Tallyward**, a fictional control-assurance app for the fictional bank Northwind Financial. It is a Next.js app with a no-account mode and a live mode backed by Tasks, Dynamic Tables, data metric functions, AI_COMPLETE, AI_CLASSIFY, AI_SIMILARITY, and a Cortex Agent (Cortex Analyst, Cortex Search, and custom stored-procedure tools).

**[Try the hosted example](https://sfc-gh-ooral.github.io/sfguide-continuous-control-testing/try/)** · **[Guide](https://sfc-gh-ooral.github.io/sfguide-continuous-control-testing/)**

The look and brand are described in [docs/DESIGN.md](docs/DESIGN.md).

> Synthetic data and illustrative logic only. This is not audit, legal, or compliance advice. AI explanations, classifications, and routes are suggestions for a person to approve.

## What it does

| Screen | What you see | Snowflake capability (live mode) |
| --- | --- | --- |
| Control coverage | 25 controls: 8 tested monthly on the full population, 17 still sampled quarterly. Records tested vs. the old sample size, exceptions by month, trend per control, pass or open count | `RUN_CONTROL_TESTS` procedure, monthly task `MONTHLY_CONTROL_TESTS`, `EXCEPTION_ROLLUP` Dynamic Table |
| Exception queue | Open exceptions grouped by root-cause cluster with severity and age, a feed-anomaly badge, and bulk disposition (True issue / Data issue / Accepted risk) that requires a note | Custom data metric function `APPROVER_2_NULL_PCT` per feed batch; dispositions written to `EXCEPTIONS` and `DISPOSITION_LOG` |
| Exception detail | The evidence row, feed quality by batch for that month, the control SQL and query ID, and an AI explanation with a suggested disposition | `AI_COMPLETE` over the evidence row, the control procedure, and the DMF results |
| Triage assistant | The intake backlog. For each ticket: classify, find duplicates, then an agent investigates, drafts a response, and proposes a route. Each step has Approve / Edit / Reject | `AI_CLASSIFY`, `AI_SIMILARITY`, Cortex Agent `TRIAGE_AGENT`; decisions written to `TRIAGE_LOG` and `WORK_ITEMS` |
| Evidence pack | Per month: each run's query ID, records tested, exceptions, run time, run by, dispositions and reviewers, feed quality, and a recount as of the run. Export CSV or PDF | Query IDs from the runner, Time Travel (`AT(TIMESTAMP => …)`, 30-day retention on `SRC`) |
| Period ribbon | Exceptions per tested month under the top bar on every screen; the August spike stands out and each month links to its queue | Same snapshot as coverage |
| Sample / Live switch | Header switch that always shows the mode. Live with no connection shows setup steps instead of asking for credentials. AI steps show staged progress; in Sample mode a recorded answer arrives after 4–8 seconds | `/api/mode`; live calls report measured latency and never fall back to sample data |

### Story on this synthetic data set

1. **From sample to population.** Coverage shows 1,930 records tested in October where the old samples checked 230.
2. **The August spike.** PY-01 (dual approval on wires over $250,000) finds 92 exceptions in August against 5 in July, about 18x.
3. **A data problem, not a control failure.** 91 of the 92 come from one feed batch, `WIRE-202608-03`, where the data metric function shows the second-approver field blank on 91% of large wires (baseline 0.64%). The triage agent finds the same thing with its feed-quality tool and routes the ticket to Data Engineering.
4. **A real exception.** AC-01 finds terminated employees who kept access for more than 30 days. The agent routes one to Identity & Access Management.
5. **Duplicates.** Three tickets describe the August spike; `AI_SIMILARITY` ranks them first for each other (0.72–0.76). Unrelated tickets can score almost as high, so the app ranks candidates and the reviewer picks the original.
6. **Evidence.** The August pack lists each run's query ID and recounts the source table as of the run with Time Travel.

These counts are planted stories on this synthetic data set. See [data/README.md](data/README.md).

## Prerequisites

| | |
| --- | --- |
| No-account mode | Node.js **20.19+ or 22.12+** (required by Tailwind CSS 4) and npm. Nothing else. |
| Live mode: edition | **Enterprise Edition or higher** (data metric functions; 30-day Time Travel) |
| Live mode: features | Cortex AI functions (`AI_COMPLETE`, `AI_CLASSIFY`, `AI_SIMILARITY`), Cortex Agents, Cortex Analyst, Cortex Search, Dynamic Tables, Tasks, data metric functions, and Git repository clones. The default model is `claude-sonnet-4-5`; if it isn't in your region, enable [cross-region inference](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cross-region-inference) or set `SNOWFLAKE_COMPLETE_MODEL`. |
| Live mode: role | `ACCOUNTADMIN` for the short account-level block in `sql/setup.sql` (role, warehouse, database, grants, API integration). Everything else runs as the least-privilege `CCT_DEMO_ROLE`. |
| Preview features | None used. `AI_CLASSIFY` runs on text only (its document input is Preview and not used here). |
| Tested | Next.js 16.3, Node 22.23, snowflake-sdk 3.4, on an Enterprise account in AWS US East 1 with cross-region inference, November 2026 |

## Quick start: no account

```bash
git clone https://github.com/sfc-gh-ooral/sfguide-continuous-control-testing.git
cd sfguide-continuous-control-testing
npm install
npm run dev
```

Open http://localhost:3000. With no `.env.local`, the app uses the bundled snapshot in `lib/sample/data.json`, exported from a live run. Every AI output is labeled **Sample AI response**. Dispositions and triage decisions you make are kept for the session only.

To regenerate the source CSVs (same seed, same files): `npm run generate-data`.

## Live mode: deploy to your account

1. **Run the setup.** Open a Snowsight SQL worksheet, paste [`sql/setup.sql`](sql/setup.sql), and run all. It took about 4 minutes on XSMALL in our test, most of it backfilling ten months of test runs. The script loads the synthetic CSVs straight from this public repository through a Git repository clone, so there's no upload step.
2. **Create a key pair** for the user that ran setup (setup grants that user `CCT_DEMO_ROLE`). Keep the key outside the repository:

   ```bash
   mkdir -p ~/.snowflake/keys
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out ~/.snowflake/keys/cct_rsa_key.p8 -nocrypt
   openssl rsa -in ~/.snowflake/keys/cct_rsa_key.p8 -pubout
   ```

   ```sql
   -- Uses the second key slot so an existing key is not replaced.
   ALTER USER <YOUR_USER> SET RSA_PUBLIC_KEY_2 = '<public key body without header lines>';
   ```

3. **Configure the app.** Copy `.env.example` to `.env.local` and fill in your account identifier (`<org>-<account>`), user, and key path.
4. **Run it.** Run `npm run dev`. Each screen shows a **Live · CCT_DEMO_ROLE · <ms>** badge.
5. **Optional: turn on the schedule.** `ALTER TASK CONTROL_TESTING_DEMO.CTRL.MONTHLY_CONTROL_TESTS RESUME;` runs the tests at 06:00 UTC on the 2nd of each month for the month that just ended.

The app uses one pooled connection as `CCT_DEMO_ROLE`, runs `USE SECONDARY ROLES NONE`, and uses bind variables for every statement.

To refresh the no-account snapshot from your live account: `node scripts/export-sample.mjs` (reads `.env.local`, replaces your user name with `CONTROL_TESTER`).

### Objects created

| Object | Name | Notes |
| --- | --- | --- |
| Role | `CCT_DEMO_ROLE` | Owns the database and warehouse; CORTEX_USER, DATA_METRIC_USER, EXECUTE DATA METRIC FUNCTION, EXECUTE TASK |
| Warehouse | `CCT_WH` | XSMALL, `AUTO_SUSPEND = 60`, starts suspended |
| Database | `CONTROL_TESTING_DEMO` | Schemas `SRC` (30-day Time Travel) and `CTRL` |
| Integration | `CCT_GIT_API` | `git_https_api`, limited to `https://github.com/sfc-gh-ooral/`, no credentials |
| Source tables (SRC) | `USER_ACCESS`, `TERMINATIONS`, `WIRE_PAYMENTS`, `LOAN_FILES`, `CHANGE_TICKETS` | About 22,000 synthetic rows; `WIRE_PAYMENTS` also has scheduled `NULL_COUNT` and `ROW_COUNT` DMFs |
| Control tables (CTRL) | `CONTROLS`, `CONTROL_OWNERS`, `TEST_RUNS`, `EXCEPTIONS`, `FEED_QUALITY`, `WORK_ITEMS`, `DISPOSITION_LOG`, `TRIAGE_LOG`, `CONTROL_PROCEDURES` | Control SQL lives in `CONTROLS` |
| Data metric function | `APPROVER_2_NULL_PCT` | Percent of wires over $250,000 with no second approver |
| Procedures | `RUN_CONTROL_TESTS`, `CHECK_FEED_QUALITY`, `LOOKUP_TABLE_METADATA`, `DRAFT_WORK_ITEM` | The last three are agent tools; `DRAFT_WORK_ITEM` only creates drafts and is not attached to the agent by default |
| Task | `MONTHLY_CONTROL_TESTS` | Created suspended |
| Dynamic Table | `EXCEPTION_ROLLUP` | `TARGET_LAG = '1 hour'`; refreshed after each disposition |
| Semantic view | `EXCEPTIONS_SV` | For Cortex Analyst |
| Cortex Search | `CONTROL_PROCEDURES_SEARCH` | Control procedures and disposition standards |
| Cortex Agent | `TRIAGE_AGENT` | Tools: `exceptions_analyst`, `procedures_search`, `check_feed_quality`, `lookup_table_metadata` |
| Stage and Git clone | `SRC.CCT_DATA`, `SRC.CCT_REPO` | Synthetic CSVs |

**Cleanup:** run [`sql/cleanup.sql`](sql/cleanup.sql). It drops the database, warehouse, integration, and role, then runs SHOW commands that should return nothing. If you registered a key for this example, also run `ALTER USER <YOUR_USER> UNSET RSA_PUBLIC_KEY_2;`.

### Expected cost and time

- **Setup:** about 4.5 minutes on XSMALL in our test (270 seconds end to end, November 20, 2026).
- **Warehouse:** our whole build (setup run three times, the sample export, and live sessions through every screen and AI step) used **0.88 credits** on XSMALL in `WAREHOUSE_METERING_HISTORY`. One setup plus a session costs less.
- **AI credits:** Cortex AI functions, Cortex Agents, and Cortex Search are billed separately by tokens. Check `SNOWFLAKE.ACCOUNT_USAGE.CORTEX_FUNCTIONS_USAGE_HISTORY` and `CORTEX_AGENT_USAGE_HISTORY`, which can lag by up to a few hours. See the [Service Consumption Table](https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf) for rates.
- **Measured latency** in our test on XSMALL, from the app server:
  - Coverage, queue, evidence: 0.4–6 s (the first call includes connecting).
  - Exception explanation (`AI_COMPLETE`): 5–8 s.
  - Classify: 0.8–1.6 s. Duplicates: 1–2.8 s.
  - Agent triage: 11.6–21.5 s.
  - Time Travel recount: 0.1–0.8 s.

  Yours will differ. The app shows the measured time on each live response.

## Known limitations

- **Ad-hoc DMF calls don't accept a filtered subquery.** `SELECT NULL_COUNT(SELECT … WHERE …)` failed in our test, so the runner copies each feed batch into a temporary table and calls the custom DMF on that.
- **Eight automated controls.** The other 17 are listed as sampled to show coverage; adding one means adding a population and an exception query to `CONTROLS`.
- **Access controls are point-in-time.** AC-01 and AC-02 re-find the same open entitlements each month, so the queue shows only the latest month for them.
- **The anomaly rule is simple:** a batch is flagged when its null rate is above 10% and five times the trailing baseline.
- **AI answers vary run to run.** The sample mode replays answers recorded from one live run; the exception explanations in sample mode are scripted from the same facts.
- **The agent can't change data.** Its tools are read only. `DRAFT_WORK_ITEM` exists for you to attach if you want drafts, and every route goes through Approve / Edit / Reject in the app.
- **Duplicate detection is a ranking, not a verdict.** On this data the planted duplicates score 0.60–0.76 and some unrelated pairs score up to 0.74, so the app never auto-links; the reviewer chooses.
- **The agent sometimes writes a planning line** before its answer; the app shows the answer from "Finding:" on.
- **Time Travel retention is 30 days** on `SRC`; recounts of older runs fail.

## Customize with Cortex Code

- "Turn my existing control test SQL into rows in `CONTROLS` with population and exception queries, and schedule `MONTHLY_CONTROL_TESTS` with a least-privilege role. Show me the plan before changing anything."
- "Connect the triage agent to my ticketing export and propose routing rules. Keep a human approval on every action."
- "Add a data metric function for each source feed and alert on freshness and null-rate changes."

## Project layout

```text
app/                 Next.js App Router pages and the /api/data route; globals.css holds the design tokens
components/          Shell (top bar, period ribbon), AiPanel (staged steps, streaming reveal), ModeSwitch, ui kit
lib/cct-data.ts      Data interface used by every screen
lib/build.ts         Shared rules that turn tables into screens (both modes)
lib/mock-data.ts     No-account implementation (also runs in the browser for /try/)
lib/live-data.ts     Snowflake implementation (server only)
lib/snowflake.ts     Connection pool, bind variables
lib/sample/          Bundled snapshot exported from a live run
scripts/             generate-data.mjs (seeded), export-sample.mjs, build-hosted-example.mjs, capture-screenshots.mjs
sql/                 setup.sql, cleanup.sql
data/                Synthetic CSVs and data README
docs/                GitHub Pages guide, screenshots, catalog cards, and the /try/ static example
```

`npm run build:example` builds the static, no-account example into `docs/try/`.

### Refresh the screenshots

```bash
npx playwright install chromium   # first time only
npm run build:example
npm run capture                   # COLOR_SCHEME=dark npm run capture for dark mode
```

`scripts/capture-screenshots.mjs` serves `docs/try/` locally and clicks through the walkthrough in a fresh headless browser at a fixed 1600×1000 viewport. It writes `docs/images/*.png` and the catalog cards `docs/catalog/*.jpg` (960×600). Review every image before publishing.

## License and disclaimer

[Apache 2.0](LICENSE). This is an illustrative example provided as is. It is not an official Snowflake product and is not supported by Snowflake Support. It contains no customer data. Review and test before any production use.

Owner: Oz Oral · Last reviewed: November 2026
