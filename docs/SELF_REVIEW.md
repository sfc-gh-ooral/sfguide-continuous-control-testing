# Self-review

Checked against the Snow Packs [CONTRIBUTING](https://github.com/sfc-gh-ooral/snow-packs/blob/main/CONTRIBUTING.md) Musts and the build standard's "Before you call it done" list. Compiled from the catalog pull request ([sfc-gh-ooral/snow-packs#37](https://github.com/sfc-gh-ooral/snow-packs/pull/37)), its review, and a re-check on November 20, 2026.

## Before you call it done

| Check | Result | Notes |
| --- | --- | --- |
| Sample mode from a fresh clone | Pass | Fresh clone, `npm ci`, `npm run dev`: the home page returns 200 (re-checked November 20, 2026). |
| setup, Live mode, cleanup in the pack role | Pass | Run during the v2 build; see the README for measured cost and time. |
| Files and full history grepped for secrets, account identifiers, user names | Pass | Re-scanned November 20, 2026: no account locators, hosts, private keys or user names; the only owner hit is the public GitHub URL. |
| Pages URL and `/try/` signed out at 390 px and desktop | Pass | All `/try/` JS and CSS return 200; no sideways scroll or console errors at 390 and 1440 px (PR test plan and review). |
| Dark mode | Pass | Renders with the dark theme and no console errors (re-checked November 20, 2026). |
| Every story beat visible in a screenshot | Pass | |

## CONTRIBUTING Musts

| Must | Result | Notes |
| --- | --- | --- |
| Business problem first; one industry and one function | Pass | Banking · Risk. |
| Public `sfguide-continuous-control-testing` repo, Apache 2.0 `LICENSE`, Pages from `/docs` with `.nojekyll` | Pass | |
| Problem and outcome on the first screen; screenshots of the running app with captions and alt text | Pass | |
| Only claims capabilities used and tested in Live mode | Pass | Tasks (Run tests now: EXECUTE TASK, polls TASK_HISTORY), Dynamic Tables, Data Metric Functions (CHECK_FEED_QUALITY reads DATA_QUALITY_MONITORING_RESULTS and calls APPROVER_2_NULL_PCT), Cortex Agents, Cortex Analyst, Semantic Views and Cortex Search via the agent, Cortex AI_COMPLETE, AI_CLASSIFY, AI_SIMILARITY, Time Travel. |
| Disclaimer, links to the repo and Snowflake docs, no Snowflake logo files, no sales motions | Pass | |
| End-user app with a real workflow; no-account Sample mode; simulated AI labeled "Sample AI response" with staged 4–8 s steps; Live mode with errors shown, no silent fallback | Pass | |
| Synthetic, deterministic data | Pass | The reviewer ran the generator twice and got identical output. |
| Self-contained setup (own database, XSMALL warehouse, least-privilege role); cleanup removes all of it | Pass | |
| No credentials, account identifiers or internal hosts in code, screenshots or history; user names redacted | Pass | key-pair auth only (token and browser paths removed in round 1). |
| No customer names, deals, internal programs or roadmap | Pass | Fictional brand and sample firm. |
| GA features, or preview features labeled | Pass | |
| README Musts: prerequisites, steps and objects, cost and time, known limitations, Customize with Cortex Code, `Owner: Oz Oral · Last reviewed: November 2026`, license and as-is disclaimer | Pass | |
| Outcomes as possibilities; synthetic results qualified | Pass | |

## Known gaps

- "Run tests now" tests the previous month by CURRENT_DATE and the synthetic data ends 2026-10-31 (reviewer follow-up, not done in this pass).

- `npm run lint` and `tsc --noEmit`: pass.
