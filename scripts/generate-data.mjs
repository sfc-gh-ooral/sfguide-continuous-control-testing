// Writes the synthetic CSVs in data/ (seeded, so output is stable). Fictional firm: Northwind Financial.
// Planted stories: (1) terminated employees keep access 30+ days, (2) over-limit wires approved by their
// initiator, (3) an August 2026 wire feed batch drops the second approver (an 18x exception jump that is a
// data problem, not a control failure), (4) duplicate backlog tickets.
import { mkdirSync, writeFileSync } from 'node:fs';

let seed = 20261119;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pad = (n, w = 4) => String(n).padStart(w, '0');
const day = (d) => d.toISOString().slice(0, 10);
const ts = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const START = new Date('2026-01-01T00:00:00Z');
const MONTHS = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, i, 1)));
const randIn = (m) => new Date(m.getTime() + rnd() * (new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)) - m));

function csv(name, header, rows) {
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  writeFileSync(`data/${name}.csv`, [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n') + '\n');
  console.log(`${name}: ${rows.length}`);
}
mkdirSync('data', { recursive: true });

const FIRST = ['Avery','Jordan','Priya','Mateo','Lena','Owen','Sofia','Kai','Nadia','Ellis','Rosa','Theo','Imani','Lucas','Maya','Ravi','Clara','Diego','Hana','Felix','Iris','Jonah','Zara','Milo','Anya','Caleb','Leah','Omar','Ruth','Simon'];
const LAST = ['Okafor','Lindqvist','Ramirez','Chen','Duarte','Abernathy','Kowalski','Nakamura','Osei','Brennan','Haddad','Moreau','Varga','Silva','Petrov','Quinlan','Adeyemi','Ferris','Tanaka','Holt'];
const DEPTS = ['Retail Banking','Treasury Ops','Commercial Lending','Technology','Finance','Operations'];

// Control owners (1st line), used by controls and routing.
const OWNERS = [
  { id: 'OWN01', name: 'Avery Okafor', team: 'Identity & Access Management' },
  { id: 'OWN02', name: 'Mateo Ramirez', team: 'Payments Operations' },
  { id: 'OWN03', name: 'Priya Chen', team: 'Lending Operations' },
  { id: 'OWN04', name: 'Owen Brennan', team: 'Technology Change Management' },
  { id: 'OWN05', name: 'Lena Duarte', team: 'Finance Controls' },
];
csv('control_owners', ['owner_id', 'owner_name', 'team'], OWNERS.map((o) => ({ owner_id: o.id, owner_name: o.name, team: o.team })));

// 25 controls: 8 automated over the full population, 17 still tested on quarterly samples.
const AUTO = [
  ['AC-01', 'Terminated user access removed within 30 days', 'Access', 'OWN01', 25],
  ['AC-02', 'Privileged access recertified every 90 days', 'Access', 'OWN01', 25],
  ['PY-01', 'Dual approval on wires over $250,000', 'Payments', 'OWN02', 40],
  ['PY-02', 'Over-limit wires approved by someone other than the initiator', 'Payments', 'OWN02', 40],
  ['LN-01', 'Required documents present before loan funding', 'Lending', 'OWN03', 30],
  ['LN-02', 'Rate below floor has an approved rate exception', 'Lending', 'OWN03', 30],
  ['CM-01', 'Production changes approved before deployment', 'Change management', 'OWN04', 25],
  ['CM-02', 'Emergency changes reviewed within 5 business days', 'Change management', 'OWN04', 15],
];
const MANUAL = [
  ['AC-03', 'Shared and generic accounts disabled', 'Access', 'OWN01'], ['AC-04', 'Vendor access expires at contract end', 'Access', 'OWN01'],
  ['AC-05', 'Segregation of duties conflicts reviewed', 'Access', 'OWN01'], ['AC-06', 'Service account passwords rotated', 'Access', 'OWN01'],
  ['PY-03', 'Beneficiary changes call-back verified', 'Payments', 'OWN02'], ['PY-04', 'Sanctions screening on outbound wires', 'Payments', 'OWN02'],
  ['PY-05', 'ACH return rates monitored', 'Payments', 'OWN02'], ['PY-06', 'Payment limit changes approved', 'Payments', 'OWN02'],
  ['LN-03', 'Appraisal independence confirmed', 'Lending', 'OWN03'], ['LN-04', 'Adverse action notices sent on time', 'Lending', 'OWN03'],
  ['LN-05', 'Loan modifications approved by credit officer', 'Lending', 'OWN03'], ['CM-03', 'Code reviewed by a second engineer', 'Change management', 'OWN04'],
  ['CM-04', 'Production access for developers removed after release', 'Change management', 'OWN04'], ['CM-05', 'Backups restored and tested quarterly', 'Change management', 'OWN04'],
  ['FN-01', 'General ledger reconciliations signed off', 'Finance', 'OWN05'], ['FN-02', 'Manual journal entries approved', 'Finance', 'OWN05'],
  ['FN-03', 'Suspense accounts cleared within 30 days', 'Finance', 'OWN05'],
];
csv('controls', ['control_id', 'control_name', 'domain', 'frequency', 'owner_id', 'test_method', 'prior_sample_size', 'last_sample_exceptions'], [
  ...AUTO.map(([id, n, d, o, s]) => ({ control_id: id, control_name: n, domain: d, frequency: 'Monthly', owner_id: o, test_method: 'Automated (full population)', prior_sample_size: s, last_sample_exceptions: 0 })),
  ...MANUAL.map(([id, n, d, o]) => ({ control_id: id, control_name: n, domain: d, frequency: 'Quarterly', owner_id: o, test_method: 'Manual sample', prior_sample_size: pick([15, 25, 25, 40]), last_sample_exceptions: rnd() < 0.2 ? 1 : 0 })),
]);

// Employees, terminations, entitlements --------------------------------------------------------
const emps = Array.from({ length: 900 }, (_, i) => ({ employee_id: `E${pad(i + 1, 5)}`, name: `${pick(FIRST)} ${pick(LAST)}`, dept: pick(DEPTS) }));
const SYSTEMS = ['Core Banking', 'Wire Platform', 'Loan Origination', 'GL', 'CRM', 'Data Warehouse', 'Treasury Portal'];
const terms = [];
for (const e of emps) if (rnd() < 0.09) terms.push({ employee_id: e.employee_id, employee_name: e.name, department: e.dept, term_date: day(addDays(START, int(0, 300))) });
csv('terminations', ['employee_id', 'employee_name', 'department', 'term_date'], terms);
const termOf = Object.fromEntries(terms.map((t) => [t.employee_id, t.term_date]));
const access = []; let aid = 1;
for (const e of emps) for (const sys of SYSTEMS) {
  if (rnd() > 0.45) continue;
  const priv = rnd() < 0.12;
  const granted = addDays(new Date('2023-01-01T00:00:00Z'), int(0, 1000));
  let revoked = null;
  const td = termOf[e.employee_id];
  if (td) {
    // Story 1: about 1 in 7 terminated entitlements are left active.
    revoked = rnd() < 0.14 ? null : day(addDays(new Date(td), int(0, rnd() < 0.85 ? 3 : 20)));
  }
  const cert = priv ? day(addDays(new Date('2026-10-31'), -int(5, rnd() < 0.1 ? 200 : 85))) : null;
  access.push({ access_id: `A${pad(aid++, 6)}`, employee_id: e.employee_id, system_name: sys, entitlement: priv ? `${sys} admin` : `${sys} user`, is_privileged: priv, granted_date: day(granted), revoked_date: revoked, last_certified_date: cert });
}
csv('user_access', ['access_id', 'employee_id', 'system_name', 'entitlement', 'is_privileged', 'granted_date', 'revoked_date', 'last_certified_date'], access);

// Wires ----------------------------------------------------------------------------------------
const ops = emps.filter((e) => e.dept === 'Treasury Ops').slice(0, 40).map((e) => e.employee_id);
const limitOf = Object.fromEntries(ops.map((o) => [o, pick([500000, 1000000, 1000000, 2500000])]));
const BENE = ['Atlas Freight Co.', 'Bluebird Medical Group', 'Cedar Ridge Builders', 'Delta Grain Partners', 'Evergreen Utilities', 'Foxglove Textiles', 'Granite Peak Mining', 'Harbor Light Shipping', 'Ironwood Furniture', 'Juniper Software Ltd.'];
const wires = []; let wid = 1;
MONTHS.forEach((m, mi) => {
  const n = int(1350, 1550);
  for (let i = 0; i < n; i++) {
    const init = pick(ops);
    const big = rnd() < 0.35;
    const amount = big ? int(250001, 4000000) : int(5000, 249000);
    let a1 = pick(ops.filter((o) => o !== init));
    let a2 = amount > 250000 ? pick(ops.filter((o) => o !== init && o !== a1)) : null;
    if (amount > 250000 && rnd() < 0.006) a2 = null; // normal background: a few missing second approvals
    if (amount > limitOf[init] && rnd() < 0.012) a1 = init; // Story 2: initiator approves own over-limit wire
    const when = randIn(m);
    const batch = `WIRE-${m.toISOString().slice(0, 7).replace('-', '')}-${pad(1 + Math.floor(rnd() * 4), 2)}`;
    const w = { wire_id: `W${pad(wid++, 6)}`, initiated_by: init, initiator_limit_usd: limitOf[init], amount_usd: amount, beneficiary: pick(BENE), value_date: day(when), approver_1: a1, approver_2: a2, released_ts: ts(addDays(when, 0.1)), feed_batch_id: batch };
    // Story 3: the August batch 03 feed drops the APPROVER_2 field for every wire it carries.
    if (mi === 7 && batch.endsWith('-03') && wid % 10 !== 0) w.approver_2 = null;
    wires.push(w);
  }
});
csv('wire_payments', ['wire_id', 'initiated_by', 'initiator_limit_usd', 'amount_usd', 'beneficiary', 'value_date', 'approver_1', 'approver_2', 'released_ts', 'feed_batch_id'], wires);

// Loans ----------------------------------------------------------------------------------------
const officers = emps.filter((e) => e.dept === 'Commercial Lending').slice(0, 20).map((e) => e.employee_id);
const loans = []; let lid = 1;
MONTHS.forEach((m) => {
  for (let i = 0, n = int(280, 330); i < n; i++) {
    const floor = pick([6.25, 6.5, 6.75]);
    const below = rnd() < 0.08;
    const rate = below ? +(floor - rnd() * 0.75).toFixed(3) : +(floor + rnd() * 2).toFixed(3);
    loans.push({ loan_id: `L${pad(lid++, 6)}`, officer_id: pick(officers), product: pick(['Commercial real estate', 'Equipment', 'Working capital', 'SBA 7(a)']), principal_usd: int(50, 4000) * 1000, funded_date: day(randIn(m)),
      rate_pct: rate, rate_floor_pct: floor, rate_exception_approved: below ? rnd() > 0.12 : false,
      has_appraisal: rnd() > 0.01, has_income_verification: rnd() > 0.012, has_signed_note: rnd() > 0.004 });
  }
});
csv('loan_files', ['loan_id', 'officer_id', 'product', 'principal_usd', 'funded_date', 'rate_pct', 'rate_floor_pct', 'rate_exception_approved', 'has_appraisal', 'has_income_verification', 'has_signed_note'], loans);

// Change tickets -------------------------------------------------------------------------------
const engs = emps.filter((e) => e.dept === 'Technology').map((e) => e.employee_id);
const changes = []; let cid = 1;
MONTHS.forEach((m) => {
  for (let i = 0, n = int(170, 210); i < n; i++) {
    const emergency = rnd() < 0.08;
    const dep = randIn(m);
    const approved = emergency ? (rnd() < 0.5 ? null : addDays(dep, rnd())) : (rnd() < 0.015 ? addDays(dep, rnd() * 2) : addDays(dep, -rnd() * 5 - 0.1));
    const pir = emergency ? (rnd() < 0.15 ? null : day(addDays(dep, int(1, rnd() < 0.15 ? 12 : 5)))) : null;
    changes.push({ change_id: `CHG${pad(cid++, 6)}`, system_name: pick(SYSTEMS), change_type: emergency ? 'Emergency' : 'Standard', requested_by: pick(engs), approved_by: approved ? pick(engs) : null,
      approved_ts: approved ? ts(approved) : null, deployed_ts: ts(dep), post_review_date: pir });
  }
});
csv('change_tickets', ['change_id', 'system_name', 'change_type', 'requested_by', 'approved_by', 'approved_ts', 'deployed_ts', 'post_review_date'], changes);

// Backlog (Jira-like intake). Story 4: several near-duplicate tickets. ------------------------
const T = [
  ['Wire dual approval exceptions jumped in August', 'The PY-01 run for August shows a large jump in wires missing a second approver. Is this a control failure? Need answer before the risk committee.', 'Open', null],
  ['PY-01 August exceptions look wrong', 'Seeing far more dual-approval breaks than usual for August. Can someone check the feed before we escalate?', 'Open', null],
  ['Huge spike in missing second approvers (Aug)', 'Payments ops says they approved everything. Exceptions on PY-01 went way up in August.', 'Open', null],
  ['Terminated employee still has Wire Platform access', 'A former Treasury Ops employee terminated in June still has an active Wire Platform user entitlement.', 'Open', null],
  ['Former employee access to Core Banking', 'AC-01 flagged an employee who left more than 30 days ago and still has Core Banking access. Please route to IAM.', 'Open', null],
  ['Request: add rate exception approver list', 'Lending wants the list of approved rate exception approvers added to LN-02 evidence.', 'Open', null],
  ['Change CHG deployed before approval', 'CM-01 shows a standard change deployed a day before approval. Need owner confirmation.', 'Open', null],
  ['Question about AC-02 recertification window', 'Is the 90 day recertification window calendar or business days?', 'Open', null],
  ['Same user initiated and approved an over-limit wire', 'PY-02 found a wire over the initiator limit where approver 1 is the initiator. Needs payments ops review.', 'Open', null],
  ['Over-limit wire self-approved', 'Another self-approved over-limit wire on PY-02. Same pattern as last month.', 'Open', null],
  ['Emergency change missing post-implementation review', 'CM-02: an emergency change has no post-implementation review after 5 business days.', 'Open', null],
  ['Loan funded without income verification', 'LN-01 exception: commercial loan funded with no income verification on file.', 'Open', null],
  ['Need evidence pack for Q3 exam', 'Examiners requested evidence for all automated access controls for Q3.', 'Open', null],
  ['Which table holds wire approvals?', 'New analyst: where do I find the approver columns for wires? Want to write my own check.', 'Open', null],
  ['Data feed for wires delayed', 'Wire feed batch 03 arrived late and looked incomplete in August.', 'Open', null],
  ['Rate exception approved after funding', 'LN-02: rate exception approval timestamp is after the funding date for one loan.', 'In progress', 'Priya Chen'],
  ['Privileged admin not recertified', 'AC-02 flagged a GL admin entitlement last certified more than 90 days ago.', 'In progress', 'Avery Okafor'],
  ['Duplicate: terminated user still active in Core Banking', 'Same as the earlier ticket about a former employee with Core Banking access.', 'Open', null],
  ['Can we test suspense accounts automatically?', 'FN-03 is still sampled quarterly. What data would we need to test the full population?', 'Open', null],
  ['Change approval evidence missing approver', 'Evidence for CM-01 is missing the approver name for two changes.', 'Closed', 'Owen Brennan'],
];
const backlog = T.map(([title, description, status, assignee], i) => ({ work_item_id: `WI-${pad(101 + i, 4)}`, title, description, status, assignee, created_ts: ts(addDays(new Date('2026-09-01T09:00:00Z'), i * 2.3)), source: 'Intake' }));
csv('work_items', ['work_item_id', 'title', 'description', 'status', 'assignee', 'created_ts', 'source'], backlog);
