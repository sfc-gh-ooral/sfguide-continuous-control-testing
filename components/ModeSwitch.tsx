'use client';

// Environment badge and Sample/Live switch. Live needs a Snowflake connection on the server; without
// one, choosing Live opens setup steps (the app never asks for credentials in the browser).
import { Database, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { type Mode, preferSample, setPreferredMode } from '@/lib/mode';
import { Drawer } from './ui';

const REPO = 'https://github.com/sfc-gh-ooral/sfguide-continuous-control-testing';

export function ModeSwitch() {
  const [configured, setConfigured] = useState<boolean>();
  const [mode, setMode] = useState<Mode>();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const done = (c: boolean) => { setConfigured(c); setMode(c && !preferSample() ? 'live' : 'sample'); };
    if (HOSTED_EXAMPLE) return done(false);
    fetch('/api/mode').then((r) => r.json()).then((j) => done(j.mode === 'live')).catch(() => done(false));
  }, []);
  if (!mode) return <span className="w-[132px] h-7" />;
  const choose = (next: Mode) => {
    if (next === mode) return;
    if (next === 'live' && !configured) { setHelp(true); return; }
    setPreferredMode(next); window.location.reload();
  };
  const live = mode === 'live';
  const seg = (on: boolean) => `flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11.5px] font-semibold transition-colors ${on ? 'bg-ink text-on-ink' : 'text-muted hover:text-ink'}`;
  return (
    <>
      <div role="radiogroup" aria-label="Data source" className="flex items-center gap-0.5 p-0.5 rounded-[7px] border border-rule bg-sheet">
        <button role="radio" aria-checked={!live} className={seg(!live)} onClick={() => choose('sample')} title="Bundled synthetic data; AI answers are captured samples">
          <FlaskConical className="w-3.5 h-3.5" aria-hidden />Sample
        </button>
        <button role="radio" aria-checked={live} className={seg(live)} onClick={() => choose('live')} title={configured ? 'Data and AI from your Snowflake account' : 'Needs a Snowflake connection'}>
          {live ? <span className="w-1.5 h-1.5 rounded-full bg-tick animate-pulse" aria-hidden /> : <Database className="w-3.5 h-3.5" aria-hidden />}Live
        </button>
      </div>
      <Drawer open={help} onClose={() => setHelp(false)} title="Connect Snowflake to use Live mode">
        {HOSTED_EXAMPLE ? (
          <p className="text-[13px]">This hosted example runs only on synthetic data in your browser. To use Live mode, clone the{' '}
            <a className="underline" href={REPO} target="_blank" rel="noreferrer">repository</a> and follow &ldquo;Live mode&rdquo; in the README.</p>
        ) : (
          <div className="space-y-3 text-[13px]">
            <p>No Snowflake connection is configured on this server. Set it up once on the machine running the app:</p>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Run <code>sql/setup.sql</code> in a Snowsight worksheet as ACCOUNTADMIN.</li>
              <li>Create a key pair and register the public key on your user (steps in <code>.env.example</code>).</li>
              <li>Copy <code>.env.example</code> to <code>.env.local</code>, fill in the account, user and key path, and restart <code>npm run dev</code>.</li>
            </ol>
          </div>
        )}
      </Drawer>
    </>
  );
}
