-- =============================================================================
-- Continuous Control Testing: Snowflake setup
-- Synthetic data only (fictional firm "Northwind Financial"). Illustrative logic;
-- not audit, legal, or compliance advice.
--
-- Run top to bottom in a Snowsight SQL worksheet (about 5 minutes on an XSMALL warehouse).
-- Requirements (see README): Cortex AI functions in your region or cross-region inference,
-- data metric functions (Enterprise Edition or higher), and a role that can create roles,
-- warehouses, databases, and API integrations.
--
-- Creates (and sql/cleanup.sql drops):
--   role        CCT_DEMO_ROLE (owns everything below; the app connects with it)
--   warehouse   CCT_WH (XSMALL, AUTO_SUSPEND = 60)
--   database    CONTROL_TESTING_DEMO (schemas SRC, CTRL)
--   integration CCT_GIT_API (read-only access to the public example repository)
-- It changes nothing that already exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1. Account-level objects (ACCOUNTADMIN)
-- -----------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;

CREATE ROLE IF NOT EXISTS CCT_DEMO_ROLE COMMENT = 'Continuous Control Testing example: object owner and app role';
GRANT ROLE CCT_DEMO_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE CCT_DEMO_ROLE TO USER IDENTIFIER($my_user);

CREATE WAREHOUSE IF NOT EXISTS CCT_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Continuous Control Testing example';
GRANT OWNERSHIP ON WAREHOUSE CCT_WH TO ROLE CCT_DEMO_ROLE;

CREATE DATABASE IF NOT EXISTS CONTROL_TESTING_DEMO COMMENT = 'Continuous Control Testing example (synthetic data)';
GRANT OWNERSHIP ON DATABASE CONTROL_TESTING_DEMO TO ROLE CCT_DEMO_ROLE;

-- Cortex AI functions, Cortex Search, and the Cortex Agent.
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE CCT_DEMO_ROLE;
-- Data metric functions: call system DMFs and schedule them on tables.
GRANT DATABASE ROLE SNOWFLAKE.DATA_METRIC_USER TO ROLE CCT_DEMO_ROLE;
GRANT EXECUTE DATA METRIC FUNCTION ON ACCOUNT TO ROLE CCT_DEMO_ROLE;
-- The monthly test task.
GRANT EXECUTE TASK ON ACCOUNT TO ROLE CCT_DEMO_ROLE;

-- Read-only access to the public GitHub repository that holds the synthetic CSVs.
CREATE API INTEGRATION IF NOT EXISTS CCT_GIT_API
  API_PROVIDER = git_https_api
  API_ALLOWED_PREFIXES = ('https://github.com/sfc-gh-ooral/')
  ENABLED = TRUE
  COMMENT = 'Continuous Control Testing example: public repository, read only';
GRANT USAGE ON INTEGRATION CCT_GIT_API TO ROLE CCT_DEMO_ROLE;

-- -----------------------------------------------------------------------------
-- Part 2. Everything else runs as the least-privilege owner role
-- -----------------------------------------------------------------------------
USE ROLE CCT_DEMO_ROLE;
USE WAREHOUSE CCT_WH;
USE DATABASE CONTROL_TESTING_DEMO;
CREATE SCHEMA IF NOT EXISTS SRC  COMMENT = 'Source populations (synthetic)';
CREATE SCHEMA IF NOT EXISTS CTRL COMMENT = 'Control library, test runs, exceptions, triage';
-- Keep 30 days of Time Travel on the source data so every evidence pack can be reproduced.
ALTER SCHEMA SRC SET DATA_RETENTION_TIME_IN_DAYS = 30;

-- 2a. Load the synthetic data ---------------------------------------------------
USE SCHEMA SRC;
CREATE OR REPLACE GIT REPOSITORY CCT_REPO
  API_INTEGRATION = CCT_GIT_API
  ORIGIN = 'https://github.com/sfc-gh-ooral/sfguide-continuous-control-testing.git';
CREATE STAGE IF NOT EXISTS CCT_DATA COMMENT = 'Synthetic CSVs copied from the repository';
COPY FILES INTO @CCT_DATA FROM @CCT_REPO/branches/main/data/;
CREATE OR REPLACE FILE FORMAT CCT_CSV TYPE = CSV PARSE_HEADER = TRUE FIELD_OPTIONALLY_ENCLOSED_BY = '"' EMPTY_FIELD_AS_NULL = TRUE ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE;

CREATE OR REPLACE TABLE TERMINATIONS (employee_id VARCHAR, employee_name VARCHAR, department VARCHAR, term_date DATE);
CREATE OR REPLACE TABLE USER_ACCESS (access_id VARCHAR, employee_id VARCHAR, system_name VARCHAR, entitlement VARCHAR,
  is_privileged BOOLEAN, granted_date DATE, revoked_date DATE, last_certified_date DATE);
CREATE OR REPLACE TABLE WIRE_PAYMENTS (wire_id VARCHAR, initiated_by VARCHAR, initiator_limit_usd NUMBER(14,2), amount_usd NUMBER(14,2),
  beneficiary VARCHAR, value_date DATE, approver_1 VARCHAR, approver_2 VARCHAR, released_ts TIMESTAMP_NTZ, feed_batch_id VARCHAR);
CREATE OR REPLACE TABLE LOAN_FILES (loan_id VARCHAR, officer_id VARCHAR, product VARCHAR, principal_usd NUMBER(14,2), funded_date DATE,
  rate_pct NUMBER(6,3), rate_floor_pct NUMBER(6,3), rate_exception_approved BOOLEAN, has_appraisal BOOLEAN,
  has_income_verification BOOLEAN, has_signed_note BOOLEAN);
CREATE OR REPLACE TABLE CHANGE_TICKETS (change_id VARCHAR, system_name VARCHAR, change_type VARCHAR, requested_by VARCHAR,
  approved_by VARCHAR, approved_ts TIMESTAMP_NTZ, deployed_ts TIMESTAMP_NTZ, post_review_date DATE);

COPY INTO TERMINATIONS   FROM @CCT_DATA/terminations.csv   FILE_FORMAT = CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;

-- Scheduled data metric functions on the wire feed: Snowflake records the null count of the
-- second approver after every load, starting with the load below (results in SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS).
ALTER TABLE WIRE_PAYMENTS SET DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES';
ALTER TABLE WIRE_PAYMENTS ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.NULL_COUNT ON (approver_2);
ALTER TABLE WIRE_PAYMENTS ADD DATA METRIC FUNCTION SNOWFLAKE.CORE.ROW_COUNT ON ();

COPY INTO USER_ACCESS    FROM @CCT_DATA/user_access.csv    FILE_FORMAT = CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO WIRE_PAYMENTS  FROM @CCT_DATA/wire_payments.csv  FILE_FORMAT = CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO LOAN_FILES     FROM @CCT_DATA/loan_files.csv     FILE_FORMAT = CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO CHANGE_TICKETS FROM @CCT_DATA/change_tickets.csv FILE_FORMAT = CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;

-- 2b. Control library -------------------------------------------------------------
USE SCHEMA CTRL;
CREATE OR REPLACE TABLE CONTROL_OWNERS (owner_id VARCHAR, owner_name VARCHAR, team VARCHAR);
CREATE OR REPLACE TABLE CONTROLS (control_id VARCHAR, control_name VARCHAR, domain VARCHAR, frequency VARCHAR, owner_id VARCHAR,
  test_method VARCHAR, prior_sample_size INT, last_sample_exceptions INT,
  population_sql VARCHAR, exception_sql VARCHAR, source_table VARCHAR);
CREATE OR REPLACE TABLE WORK_ITEMS (work_item_id VARCHAR, title VARCHAR, description VARCHAR, status VARCHAR, assignee VARCHAR,
  created_ts TIMESTAMP_NTZ, source VARCHAR, routed_team VARCHAR, response VARCHAR, updated_by VARCHAR, updated_ts TIMESTAMP_NTZ);
COPY INTO CONTROL_OWNERS FROM @SRC.CCT_DATA/control_owners.csv FILE_FORMAT = SRC.CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO CONTROLS       FROM @SRC.CCT_DATA/controls.csv       FILE_FORMAT = SRC.CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO WORK_ITEMS     FROM @SRC.CCT_DATA/work_items.csv     FILE_FORMAT = SRC.CCT_CSV MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;

-- Test logic for the automated controls. Each exception query takes the period start and end
-- as bind variables and returns: record_id, cluster_key (root-cause grouping), severity, detail.
UPDATE CONTROLS c SET population_sql = t.pop, exception_sql = t.exc, source_table = t.src FROM (
  SELECT 'AC-01' id, 'SRC.USER_ACCESS' src,
$$SELECT COUNT(*) FROM SRC.USER_ACCESS a JOIN SRC.TERMINATIONS t USING (employee_id)
WHERE ?::DATE IS NOT NULL AND t.term_date <= DATEADD(day, -30, ?::DATE)$$ pop,
$$SELECT a.access_id, a.system_name, IFF(a.is_privileged OR a.system_name = 'Wire Platform', 'High', 'Medium'),
  OBJECT_CONSTRUCT_KEEP_NULL('employee_id', a.employee_id, 'employee_name', t.employee_name, 'department', t.department,
    'system', a.system_name, 'entitlement', a.entitlement, 'term_date', t.term_date,
    'days_since_termination', DATEDIFF(day, t.term_date, p.e))
FROM SRC.USER_ACCESS a JOIN SRC.TERMINATIONS t USING (employee_id), (SELECT ?::DATE s, ?::DATE e) p
WHERE t.term_date <= DATEADD(day, -30, p.e) AND (a.revoked_date IS NULL OR a.revoked_date > p.e)$$ exc
  UNION ALL SELECT 'AC-02', 'SRC.USER_ACCESS',
$$SELECT COUNT(*) FROM SRC.USER_ACCESS WHERE ?::DATE IS NOT NULL AND is_privileged AND granted_date <= ?::DATE$$,
$$SELECT a.access_id, a.system_name, 'Medium',
  OBJECT_CONSTRUCT_KEEP_NULL('employee_id', a.employee_id, 'entitlement', a.entitlement, 'last_certified_date', a.last_certified_date,
    'days_since_certification', DATEDIFF(day, a.last_certified_date, p.e))
FROM SRC.USER_ACCESS a, (SELECT ?::DATE s, ?::DATE e) p
WHERE a.is_privileged AND a.granted_date <= p.e AND (a.revoked_date IS NULL OR a.revoked_date > p.e)
  AND a.last_certified_date <= p.e AND a.last_certified_date < DATEADD(day, -90, p.e)$$
  UNION ALL SELECT 'PY-01', 'SRC.WIRE_PAYMENTS',
$$SELECT COUNT(*) FROM SRC.WIRE_PAYMENTS WHERE amount_usd > 250000 AND value_date BETWEEN ? AND ?$$,
$$SELECT w.wire_id, w.feed_batch_id, IFF(w.amount_usd > 1000000, 'High', 'Medium'),
  OBJECT_CONSTRUCT_KEEP_NULL('amount_usd', w.amount_usd, 'beneficiary', w.beneficiary, 'value_date', w.value_date,
    'initiated_by', w.initiated_by, 'approver_1', w.approver_1, 'approver_2', w.approver_2, 'feed_batch_id', w.feed_batch_id)
FROM SRC.WIRE_PAYMENTS w WHERE w.amount_usd > 250000 AND w.value_date BETWEEN ? AND ? AND w.approver_2 IS NULL$$
  UNION ALL SELECT 'PY-02', 'SRC.WIRE_PAYMENTS',
$$SELECT COUNT(*) FROM SRC.WIRE_PAYMENTS WHERE amount_usd > initiator_limit_usd AND value_date BETWEEN ? AND ?$$,
$$SELECT w.wire_id, 'Self-approval by ' || w.initiated_by, 'High',
  OBJECT_CONSTRUCT_KEEP_NULL('amount_usd', w.amount_usd, 'initiator_limit_usd', w.initiator_limit_usd, 'beneficiary', w.beneficiary,
    'value_date', w.value_date, 'initiated_by', w.initiated_by, 'approver_1', w.approver_1, 'feed_batch_id', w.feed_batch_id)
FROM SRC.WIRE_PAYMENTS w WHERE w.amount_usd > w.initiator_limit_usd AND w.value_date BETWEEN ? AND ?
  AND (w.approver_1 = w.initiated_by OR w.approver_2 = w.initiated_by)$$
  UNION ALL SELECT 'LN-01', 'SRC.LOAN_FILES',
$$SELECT COUNT(*) FROM SRC.LOAN_FILES WHERE funded_date BETWEEN ? AND ?$$,
$$SELECT l.loan_id, IFF(NOT l.has_signed_note, 'Missing signed note', IFF(NOT l.has_appraisal, 'Missing appraisal', 'Missing income verification')),
  IFF(NOT l.has_signed_note, 'High', 'Medium'),
  OBJECT_CONSTRUCT_KEEP_NULL('product', l.product, 'principal_usd', l.principal_usd, 'funded_date', l.funded_date, 'officer_id', l.officer_id,
    'has_appraisal', l.has_appraisal, 'has_income_verification', l.has_income_verification, 'has_signed_note', l.has_signed_note)
FROM SRC.LOAN_FILES l WHERE l.funded_date BETWEEN ? AND ?
  AND NOT (l.has_appraisal AND l.has_income_verification AND l.has_signed_note)$$
  UNION ALL SELECT 'LN-02', 'SRC.LOAN_FILES',
$$SELECT COUNT(*) FROM SRC.LOAN_FILES WHERE rate_pct < rate_floor_pct AND funded_date BETWEEN ? AND ?$$,
$$SELECT l.loan_id, l.product, IFF(l.rate_floor_pct - l.rate_pct > 0.5, 'High', 'Medium'),
  OBJECT_CONSTRUCT_KEEP_NULL('product', l.product, 'principal_usd', l.principal_usd, 'rate_pct', l.rate_pct, 'rate_floor_pct', l.rate_floor_pct,
    'officer_id', l.officer_id, 'funded_date', l.funded_date)
FROM SRC.LOAN_FILES l WHERE l.rate_pct < l.rate_floor_pct AND NOT l.rate_exception_approved AND l.funded_date BETWEEN ? AND ?$$
  UNION ALL SELECT 'CM-01', 'SRC.CHANGE_TICKETS',
$$SELECT COUNT(*) FROM SRC.CHANGE_TICKETS WHERE change_type = 'Standard' AND deployed_ts::DATE BETWEEN ? AND ?$$,
$$SELECT c.change_id, c.system_name, IFF(c.system_name IN ('Wire Platform', 'Core Banking'), 'High', 'Medium'),
  OBJECT_CONSTRUCT_KEEP_NULL('system', c.system_name, 'requested_by', c.requested_by, 'approved_by', c.approved_by,
    'approved_ts', c.approved_ts, 'deployed_ts', c.deployed_ts, 'hours_after_deploy', DATEDIFF(hour, c.deployed_ts, c.approved_ts))
FROM SRC.CHANGE_TICKETS c WHERE c.change_type = 'Standard' AND c.deployed_ts::DATE BETWEEN ? AND ?
  AND (c.approved_ts IS NULL OR c.approved_ts > c.deployed_ts)$$
  UNION ALL SELECT 'CM-02', 'SRC.CHANGE_TICKETS',
$$SELECT COUNT(*) FROM SRC.CHANGE_TICKETS WHERE change_type = 'Emergency' AND deployed_ts::DATE BETWEEN ? AND ?$$,
$$SELECT c.change_id, c.system_name, 'Medium',
  OBJECT_CONSTRUCT_KEEP_NULL('system', c.system_name, 'requested_by', c.requested_by, 'deployed_ts', c.deployed_ts,
    'post_review_date', c.post_review_date)
FROM SRC.CHANGE_TICKETS c WHERE c.change_type = 'Emergency' AND c.deployed_ts::DATE BETWEEN ? AND ?
  AND (c.post_review_date IS NULL OR c.post_review_date > DATEADD(day, 7, c.deployed_ts::DATE))$$
) t WHERE c.control_id = t.id;

-- 2c. Run history, exceptions, data-quality results, dispositions ---------------------
CREATE OR REPLACE TABLE TEST_RUNS (run_id VARCHAR, control_id VARCHAR, period_start DATE, period_end DATE,
  population_count INT, exception_count INT, query_id VARCHAR, run_ts TIMESTAMP_LTZ, run_by VARCHAR, trigger_type VARCHAR);
CREATE OR REPLACE TABLE EXCEPTIONS (exception_id VARCHAR, run_id VARCHAR, control_id VARCHAR, period_start DATE,
  record_id VARCHAR, cluster_key VARCHAR, severity VARCHAR, detail VARIANT,
  disposition VARCHAR, disposition_note VARCHAR, disposed_by VARCHAR, disposed_ts TIMESTAMP_LTZ);
CREATE OR REPLACE TABLE FEED_QUALITY (period_start DATE, source_table VARCHAR, feed_batch_id VARCHAR, metric VARCHAR,
  metric_value FLOAT, baseline_value FLOAT, is_anomaly BOOLEAN, measured_ts TIMESTAMP_LTZ);
CREATE OR REPLACE TABLE DISPOSITION_LOG (exception_id VARCHAR, disposition VARCHAR, note VARCHAR, actor VARCHAR, ts TIMESTAMP_LTZ);
CREATE OR REPLACE TABLE TRIAGE_LOG (work_item_id VARCHAR, step VARCHAR, ai_output VARCHAR, decision VARCHAR, final_output VARCHAR,
  actor VARCHAR, ts TIMESTAMP_LTZ);

-- 2d. Custom data metric function for the wire feed ------------------------------------
CREATE OR REPLACE DATA METRIC FUNCTION APPROVER_2_NULL_PCT(t TABLE(amount_usd NUMBER, approver_2 VARCHAR))
  RETURNS NUMBER
  COMMENT = 'Percent of wires over 250,000 USD that arrived with no second approver'
  AS 'SELECT ROUND(100 * COUNT_IF(approver_2 IS NULL) / NULLIF(COUNT(*), 0), 2) FROM t WHERE amount_usd > 250000';

-- 2e. The test runner -------------------------------------------------------------
-- Runs every automated control over the full population for one month, records the query ID of
-- each test (for evidence), and measures the wire feed with system DMFs so a data problem can be
-- told apart from a control failure.
CREATE OR REPLACE PROCEDURE RUN_CONTROL_TESTS(PERIOD_START DATE, TRIGGER_TYPE VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
DECLARE
  p_end DATE DEFAULT LAST_DAY(:PERIOD_START);
  run_id VARCHAR;
  pop INT;
  exc INT;
  qid VARCHAR;
  stmt VARCHAR;
  cid VARCHAR;
  done INT DEFAULT 0;
  c1 CURSOR FOR SELECT control_id, population_sql, exception_sql FROM CTRL.CONTROLS WHERE exception_sql IS NOT NULL ORDER BY control_id;
  nulls FLOAT;
  rows_ FLOAT;
  base FLOAT;
BEGIN
  FOR c IN c1 DO
    cid := c.control_id;
    run_id := cid || '-' || TO_VARCHAR(:PERIOD_START, 'YYYYMM') || '-' || TO_VARCHAR(CURRENT_TIMESTAMP(), 'YYYYMMDDHH24MISS');
    stmt := c.population_sql;
    LET rs1 RESULTSET := (EXECUTE IMMEDIATE :stmt USING (PERIOD_START, p_end));
    LET cur1 CURSOR FOR rs1;
    OPEN cur1; FETCH cur1 INTO pop; CLOSE cur1;
    stmt := 'INSERT INTO CTRL.EXCEPTIONS (exception_id, run_id, control_id, period_start, record_id, cluster_key, severity, detail) ' ||
            'SELECT ''' || :run_id || '-'' || ROW_NUMBER() OVER (ORDER BY 1), ''' || :run_id || ''', ''' || cid || ''', ?::DATE, x.* FROM (' ||
            c.exception_sql || ') x';
    EXECUTE IMMEDIATE :stmt USING (PERIOD_START, PERIOD_START, p_end);
    qid := LAST_QUERY_ID();
    SELECT COUNT(*) INTO :exc FROM CTRL.EXCEPTIONS WHERE run_id = :run_id;
    INSERT INTO CTRL.TEST_RUNS VALUES (:run_id, :cid, :PERIOD_START, :p_end, :pop, :exc, :qid, CURRENT_TIMESTAMP(), CURRENT_USER(), :TRIGGER_TYPE);
    done := done + 1;
  END FOR;

  -- Feed quality: null rate of the second approver on wires that need one, per feed batch (custom DMF).
  DELETE FROM CTRL.FEED_QUALITY WHERE period_start = :PERIOD_START;
  LET rsb RESULTSET := (SELECT DISTINCT feed_batch_id FROM SRC.WIRE_PAYMENTS WHERE value_date BETWEEN :PERIOD_START AND :p_end ORDER BY 1);
  LET b1 CURSOR FOR rsb;
  FOR b IN b1 DO
    LET bid VARCHAR := b.feed_batch_id;
    -- Snapshot the batch, then measure it with data metric functions called ad hoc.
    CREATE OR REPLACE TEMPORARY TABLE CTRL.FEED_BATCH_SNAPSHOT AS
      SELECT amount_usd, approver_2 FROM SRC.WIRE_PAYMENTS WHERE feed_batch_id = :bid;
    LET rsq RESULTSET := (SELECT CTRL.APPROVER_2_NULL_PCT(SELECT amount_usd, approver_2 FROM CTRL.FEED_BATCH_SNAPSHOT) AS v);
    LET curq CURSOR FOR rsq;
    OPEN curq; FETCH curq INTO nulls; CLOSE curq;
    SELECT COUNT_IF(amount_usd > 250000) INTO :rows_ FROM CTRL.FEED_BATCH_SNAPSHOT;
    SELECT COALESCE(AVG(metric_value), 0) INTO :base FROM CTRL.FEED_QUALITY
      WHERE source_table = 'SRC.WIRE_PAYMENTS' AND metric = 'APPROVER_2_NULL_PCT' AND period_start < :PERIOD_START AND NOT is_anomaly;
    INSERT INTO CTRL.FEED_QUALITY SELECT :PERIOD_START, 'SRC.WIRE_PAYMENTS', :bid, 'APPROVER_2_NULL_PCT',
      ROUND(:nulls, 2), ROUND(:base, 2), :nulls > GREATEST(10, 5 * :base), CURRENT_TIMESTAMP();
    INSERT INTO CTRL.FEED_QUALITY SELECT :PERIOD_START, 'SRC.WIRE_PAYMENTS', :bid, 'ROW_COUNT', :rows_, NULL, FALSE, CURRENT_TIMESTAMP();
  END FOR;
  RETURN OBJECT_CONSTRUCT_KEEP_NULL('period_start', :PERIOD_START, 'controls_run', :done);
END;
$$;

-- Backfill January to October 2026 so the app has a trend, oldest first.
CALL RUN_CONTROL_TESTS('2026-01-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-02-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-03-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-04-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-05-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-06-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-07-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-08-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-09-01', 'Backfill');
CALL RUN_CONTROL_TESTS('2026-10-01', 'Backfill');

-- Monthly schedule: on the 2nd of each month, test the month that just ended. Created suspended so
-- the example costs nothing while idle; the app's "Run tests now" button runs it on demand with
-- EXECUTE TASK. Run `ALTER TASK CTRL.MONTHLY_CONTROL_TESTS RESUME;` to turn the schedule on.
CREATE OR REPLACE TASK MONTHLY_CONTROL_TESTS
  WAREHOUSE = CCT_WH
  SCHEDULE = 'USING CRON 0 6 2 * * UTC'
  COMMENT = 'Continuous Control Testing example: full-population monthly run'
  AS CALL CTRL.RUN_CONTROL_TESTS(DATE_TRUNC(month, DATEADD(month, -1, CURRENT_DATE())), 'Scheduled');

-- 2f. Exception rollup (Dynamic Table) ----------------------------------------------
CREATE OR REPLACE DYNAMIC TABLE EXCEPTION_ROLLUP
  TARGET_LAG = '1 hour' WAREHOUSE = CCT_WH
  COMMENT = 'Latest run per control and month, with exception rate and open count'
  AS
  WITH latest AS (
    SELECT * FROM TEST_RUNS
    QUALIFY ROW_NUMBER() OVER (PARTITION BY control_id, period_start ORDER BY run_ts DESC) = 1
  )
  SELECT r.control_id, r.period_start, r.run_id, r.population_count, r.exception_count,
         ROUND(100 * r.exception_count / NULLIF(r.population_count, 0), 3) AS exception_rate_pct,
         COUNT_IF(e.exception_id IS NOT NULL AND e.disposition IS NULL) AS open_exceptions,
         COUNT_IF(e.severity = 'High') AS high_severity
  FROM latest r
  LEFT JOIN EXCEPTIONS e ON e.run_id = r.run_id
  GROUP BY ALL;

-- 2g. Control procedures for Cortex Search -------------------------------------------
CREATE OR REPLACE TABLE CONTROL_PROCEDURES (doc_id VARCHAR, control_id VARCHAR, title VARCHAR, body VARCHAR);
INSERT INTO CONTROL_PROCEDURES VALUES
('P-AC-01','AC-01','Terminated user access removal','Identity & Access Management removes all entitlements within 30 days of an HR termination. Exceptions are routed to IAM (Avery Okafor). A true issue requires revoking the entitlement and reviewing activity since the termination date. Wire Platform and privileged entitlements are High severity.'),
('P-AC-02','AC-02','Privileged access recertification','Privileged entitlements are recertified every 90 calendar days by the system owner. Overdue recertifications are routed to IAM. Accepted risk requires a CISO sign-off note.'),
('P-PY-01','PY-01','Dual approval on large wires','Every outbound wire over 250,000 USD needs two approvers who are not the initiator. Before treating a spike as a control failure, check the feed: if one feed batch shows a missing APPROVER_2 field for most of its wires, the data feed is at fault. Confirm with the payments platform audit log, disposition as Data issue, and open a ticket with Data Engineering for the wire feed. Real breaks are routed to Payments Operations (Mateo Ramirez).'),
('P-PY-02','PY-02','Over-limit wire approval','A wire above the initiator limit must be approved by someone other than the initiator. Self-approval is always a true issue and High severity. Route to Payments Operations and notify Operational Risk the same day.'),
('P-LN-01','LN-01','Required loan documents','Loans may fund only with an appraisal, income verification, and signed note on file. Missing signed notes are High severity. Route to Lending Operations (Priya Chen).'),
('P-LN-02','LN-02','Rate floor exceptions','A rate below the product floor needs an approved rate exception before funding. Route to Lending Operations. Accepted risk needs a credit committee note.'),
('P-CM-01','CM-01','Change approval before deployment','Standard production changes must be approved before deployment. Route to Technology Change Management (Owen Brennan). Changes to Wire Platform or Core Banking are High severity.'),
('P-CM-02','CM-02','Emergency change review','Emergency changes need a post-implementation review within 5 business days. Route to Technology Change Management.'),
('P-GEN-01',NULL,'Exception disposition standard','Each exception gets one disposition: True issue (control failed; remediation owed by the control owner), Data issue (the test input was wrong; fix the feed and rerun), or Accepted risk (documented approval). Every disposition needs a note and is logged with the reviewer and time.'),
('P-GEN-02',NULL,'Data quality checks on source feeds','Each source feed is measured with data metric functions (null count and row count per batch). A null rate more than five times the trailing baseline marks the batch as a data anomaly. Exceptions from an anomalous batch should be reviewed as possible data issues first.'),
('P-GEN-03',NULL,'Evidence for examiners','Each test run keeps the query ID, population count, exception count, run time, and reviewer dispositions. The source tables keep 30 days of Time Travel so the population can be recounted as of the run time.'),
('P-GEN-04',NULL,'Backlog intake and routing','Intake tickets are classified as Control failure, Data quality issue, Evidence request, Question, or Enhancement request. Duplicates are linked to the original. Control failures go to the control owner, data quality issues to Data Engineering, evidence requests to Internal Audit, and questions to the control testing team.');

CREATE OR REPLACE CORTEX SEARCH SERVICE CONTROL_PROCEDURES_SEARCH
  ON body ATTRIBUTES control_id, title
  WAREHOUSE = CCT_WH TARGET_LAG = '1 day'
  COMMENT = 'Control test procedures and disposition standards'
  AS SELECT doc_id, control_id, title, body FROM CONTROL_PROCEDURES;

-- 2h. Semantic view over the results (Cortex Analyst) ---------------------------------
CREATE OR REPLACE SEMANTIC VIEW EXCEPTIONS_SV
  TABLES (
    ctl AS CTRL.CONTROLS PRIMARY KEY (control_id) COMMENT = 'Control library',
    own AS CTRL.CONTROL_OWNERS PRIMARY KEY (owner_id) COMMENT = 'First-line control owners',
    run AS CTRL.TEST_RUNS PRIMARY KEY (run_id) COMMENT = 'One row per control per monthly run',
    exc AS CTRL.EXCEPTIONS PRIMARY KEY (exception_id) COMMENT = 'Exceptions found by each run',
    fq  AS CTRL.FEED_QUALITY COMMENT = 'Data metric function results per wire feed batch and month'
  )
  RELATIONSHIPS (
    ctl_owner AS ctl (owner_id) REFERENCES own,
    run_ctl AS run (control_id) REFERENCES ctl,
    exc_run AS exc (run_id) REFERENCES run
  )
  FACTS (
    run.population_fact AS population_count,
    run.exception_fact AS exception_count,
    fq.metric_value_fact AS metric_value
  )
  DIMENSIONS (
    ctl.control_id AS control_id, ctl.control_name AS control_name,
    ctl.domain AS domain COMMENT = 'Access, Payments, Lending, Change management, or Finance',
    ctl.test_method AS test_method COMMENT = 'Automated (full population) or Manual sample',
    own.owner_name AS owner_name, own.team AS team,
    run.period_start AS period_start COMMENT = 'First day of the tested month',
    run.run_ts AS run_ts,
    exc.record_id AS record_id, exc.severity AS severity,
    exc.cluster_key AS cluster_key COMMENT = 'Root-cause grouping, for example the wire feed batch ID or system name',
    exc.disposition AS disposition COMMENT = 'True issue, Data issue, Accepted risk, or null when open',
    fq.feed_batch_id AS feed_batch_id, fq.metric AS metric, fq.is_anomaly AS is_anomaly,
    fq.fq_period AS fq.period_start COMMENT = 'Month of the feed quality measurement'
  )
  METRICS (
    run.total_population AS SUM(run.population_fact) COMMENT = 'Records tested',
    run.total_exceptions AS SUM(run.exception_fact) COMMENT = 'Exceptions found',
    exc.exception_count AS COUNT(exc.exception_id),
    exc.open_exception_count AS COUNT_IF(exc.disposition IS NULL),
    fq.avg_metric_value AS AVG(fq.metric_value_fact)
  )
  COMMENT = 'Continuous Control Testing: test runs, exceptions, and feed quality';

-- 2i. Custom tools for the agent ------------------------------------------------------
-- Data exploration: list the columns of a source or control table (read only).
CREATE OR REPLACE PROCEDURE LOOKUP_TABLE_METADATA(TABLE_NAME VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  res VARCHAR;
BEGIN
  SELECT LISTAGG(table_schema || '.' || table_name || '.' || column_name || ' ' || data_type, '\n') WITHIN GROUP (ORDER BY table_schema, table_name, ordinal_position)
    INTO :res
  FROM CONTROL_TESTING_DEMO.INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema IN ('SRC', 'CTRL')
    AND (UPPER(:TABLE_NAME) = 'ALL' OR CONTAINS(UPPER(table_name), UPPER(:TABLE_NAME)) OR CONTAINS(UPPER(table_schema || '.' || table_name), UPPER(:TABLE_NAME)));
  RETURN COALESCE(:res, 'No matching tables in SRC or CTRL.');
END;
$$;

-- Feed quality for one month. Runs data metric functions live on every call: reads the latest
-- results of the scheduled NULL_COUNT and ROW_COUNT DMFs on the wire feed, calls the custom
-- APPROVER_2_NULL_PCT DMF ad hoc over the whole feed, and adds the per-batch results the last test run stored.
CREATE OR REPLACE PROCEDURE CHECK_FEED_QUALITY(PERIOD_START VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  sched VARCHAR;
  feed_pct FLOAT;
  res VARCHAR;
BEGIN
  LET rs1 RESULTSET := (SELECT LISTAGG(metric_name || ' = ' || value || ' (measured ' || TO_VARCHAR(measurement_time, 'YYYY-MM-DD HH24:MI') || ')', '; ') AS v
    FROM (SELECT metric_name, value, measurement_time
          FROM TABLE(SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS(REF_ENTITY_NAME => 'CONTROL_TESTING_DEMO.SRC.WIRE_PAYMENTS', REF_ENTITY_DOMAIN => 'TABLE'))
          QUALIFY ROW_NUMBER() OVER (PARTITION BY metric_name ORDER BY measurement_time DESC) = 1));
  LET cur1 CURSOR FOR rs1;
  OPEN cur1; FETCH cur1 INTO sched; CLOSE cur1;
  LET rs2 RESULTSET := (SELECT CTRL.APPROVER_2_NULL_PCT(SELECT amount_usd, approver_2 FROM SRC.WIRE_PAYMENTS) AS v);
  LET cur2 CURSOR FOR rs2;
  OPEN cur2; FETCH cur2 INTO feed_pct; CLOSE cur2;
  SELECT LISTAGG(feed_batch_id || ': approver_2 null ' || metric_value || '% (baseline ' || baseline_value || '%)' || IFF(is_anomaly, ' ANOMALY', ''), '\n')
         WITHIN GROUP (ORDER BY feed_batch_id) INTO :res
  FROM CTRL.FEED_QUALITY WHERE metric = 'APPROVER_2_NULL_PCT' AND period_start = DATE_TRUNC(month, TRY_TO_DATE(:PERIOD_START));
  RETURN 'Scheduled DMFs on SRC.WIRE_PAYMENTS: ' || COALESCE(NULLIF(:sched, ''), 'no results yet') ||
         '\nAPPROVER_2_NULL_PCT over the whole feed, measured now: ' || COALESCE(TO_VARCHAR(ROUND(:feed_pct, 2)), 'n/a') || '%' ||
         '\nBy feed batch for that month:\n' || COALESCE(:res, 'No feed quality results for that month.');
END;
$$;

-- Draft a work item. The agent can only create drafts; a person approves them in the app.
CREATE OR REPLACE PROCEDURE DRAFT_WORK_ITEM(TITLE VARCHAR, DESCRIPTION VARCHAR, ROUTED_TEAM VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  wid VARCHAR DEFAULT 'WI-D' || TO_VARCHAR(CURRENT_TIMESTAMP(), 'MMDDHH24MISSFF3');
BEGIN
  INSERT INTO CTRL.WORK_ITEMS (work_item_id, title, description, status, created_ts, source, routed_team)
    VALUES (:wid, LEFT(:TITLE, 200), LEFT(:DESCRIPTION, 2000), 'Draft (needs approval)', CURRENT_TIMESTAMP(), 'Agent', LEFT(:ROUTED_TEAM, 100));
  RETURN 'Drafted ' || :wid || ' for ' || :ROUTED_TEAM || '. It stays a draft until a person approves it.';
END;
$$;

-- 2j. The triage agent ---------------------------------------------------------------
CREATE OR REPLACE AGENT TRIAGE_AGENT
  COMMENT = 'Continuous Control Testing: backlog triage orchestrator'
  FROM SPECIFICATION
$$
models:
  orchestration: auto
instructions:
  orchestration: >
    You triage control testing backlog tickets for Northwind Financial. For each ticket: find the facts
    with the tools (exceptions_analyst for run and exception numbers, procedures_search for the control
    procedure, check_feed_quality when a spike or missing field could be a data feed problem,
    lookup_table_metadata when someone asks where data lives). Do not create work items unless asked.
  response: >
    Reply in under 150 words with three parts: "Finding:" what the data shows, with numbers;
    "Draft response:" two or three sentences to the requester; and a final line "Route: <team>" where team
    is one of Identity & Access Management, Payments Operations, Lending Operations,
    Technology Change Management, Finance Controls, Data Engineering, Internal Audit, Control Testing.
tools:
  - tool_spec: { type: cortex_analyst_text_to_sql, name: exceptions_analyst, description: "Test runs, exception counts and rates by control and month, dispositions, and feed quality results" }
  - tool_spec: { type: cortex_search, name: procedures_search, description: "Control test procedures, routing rules, and disposition standards" }
  - tool_spec:
      type: generic
      name: check_feed_quality
      description: "Data metric function results for the wire feed for one month: approver_2 null percent per feed batch against its baseline, with anomalies flagged"
      input_schema: { type: object, properties: { period_start: { type: string, description: "Any date in the month, YYYY-MM-DD" } }, required: [period_start] }
  - tool_spec:
      type: generic
      name: lookup_table_metadata
      description: "Columns and types of source and control tables. Pass a table name fragment such as WIRE or ALL"
      input_schema: { type: object, properties: { table_name: { type: string, description: "Table name or fragment" } }, required: [table_name] }
tool_resources:
  exceptions_analyst: { semantic_view: CONTROL_TESTING_DEMO.CTRL.EXCEPTIONS_SV, execution_environment: { type: warehouse, warehouse: CCT_WH } }
  procedures_search: { name: CONTROL_TESTING_DEMO.CTRL.CONTROL_PROCEDURES_SEARCH, max_results: 4 }
  check_feed_quality: { type: procedure, identifier: CONTROL_TESTING_DEMO.CTRL.CHECK_FEED_QUALITY, execution_environment: { type: warehouse, warehouse: CCT_WH } }
  lookup_table_metadata: { type: procedure, identifier: CONTROL_TESTING_DEMO.CTRL.LOOKUP_TABLE_METADATA, execution_environment: { type: warehouse, warehouse: CCT_WH } }
$$;

-- Done. Quick check:
SELECT control_id, period_start, population_count, exception_count FROM CTRL.TEST_RUNS
WHERE control_id = 'PY-01' ORDER BY period_start;
