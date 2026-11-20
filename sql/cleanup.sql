-- =============================================================================
-- Continuous Control Testing: remove everything sql/setup.sql created.
-- Run as ACCOUNTADMIN. Touches nothing else.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
ALTER TASK IF EXISTS CONTROL_TESTING_DEMO.CTRL.MONTHLY_CONTROL_TESTS SUSPEND;
DROP DATABASE IF EXISTS CONTROL_TESTING_DEMO;   -- tables, Dynamic Table, task, DMF, agent, search service, semantic view, Git repository
DROP WAREHOUSE IF EXISTS CCT_WH;
DROP INTEGRATION IF EXISTS CCT_GIT_API;
DROP ROLE IF EXISTS CCT_DEMO_ROLE;

-- Confirm nothing is left (each should return no rows):
SHOW DATABASES LIKE 'CONTROL_TESTING_DEMO';
SHOW WAREHOUSES LIKE 'CCT_WH';
SHOW INTEGRATIONS LIKE 'CCT_GIT_API';
SHOW ROLES LIKE 'CCT_DEMO_ROLE';
