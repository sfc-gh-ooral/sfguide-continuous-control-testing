'use client';

// Tallyward app shell: top bar with section tabs, role chip, environment switch and theme toggle;
// the period ribbon (exceptions per tested month) under it; disclaimer footer.
import { Moon, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { monthLabel } from '@/lib/build';
import { data } from '@/lib/client';
import type { Coverage } from '@/lib/types';
import { ModeSwitch } from './ModeSwitch';
import { Logo } from './ui';
import { useAsync } from './useAsync';

const TABS = [
  { href: '/', label: 'Coverage' },
  { href: '/queue', label: 'Exception queue' },
  { href: '/triage', label: 'Triage' },
  { href: '/evidence', label: 'Evidence pack' },
];

const CoverageCtx = createContext<{ coverage?: Coverage; error?: string; reload: () => void }>({ reload: () => {} });
export const useCoverage = () => useContext(CoverageCtx);

const themeListeners = new Set<() => void>();
const subscribeTheme = (f: () => void) => { themeListeners.add(f); return () => { themeListeners.delete(f); }; };

function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains('dark'), () => false);
  const flip = () => { const d = !dark; document.documentElement.classList.toggle('dark', d); localStorage.setItem('tw-theme', d ? 'dark' : 'light'); themeListeners.forEach((f) => f()); };
  return (
    <button className="btn btn-sm !px-2" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun className="w-4 h-4" aria-hidden /> : <Moon className="w-4 h-4" aria-hidden />}
    </button>
  );
}

function PeriodRibbon({ c }: { c?: Coverage }) {
  const months = c?.months ?? [];
  const totals = months.map((_, i) => c!.controls.reduce((a, x) => a + (x.trend[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const spike = totals.findIndex((t, i) => i > 0 && t > 2 * totals[i - 1]);
  return (
    <div className="border-b border-rule bg-sheet/70 no-print">
      <div className="max-w-[1320px] mx-auto px-4 lg:px-6 py-2 flex items-center gap-3">
        <span className="eyebrow shrink-0 hidden sm:block">Exceptions by month</span>
        <div className="flex-1 min-w-0 overflow-x-auto">
          <ol className="flex gap-1 min-w-[560px]">
            {months.length === 0 && Array.from({ length: 10 }, (_, i) => <li key={i} className="flex-1 h-9 skel" />)}
            {months.map((m, i) => (
              <li key={m} className="flex-1">
                <Link href={`/queue?period=${m}`} className="group block rounded-md px-1.5 pt-1 pb-0.5 hover:bg-sheet-2 transition-colors"
                  title={`${monthLabel(m)}: ${totals[i]} exceptions${i === spike ? ' (spike)' : ''}`}>
                  <div className="h-7 flex items-end"><div className={`w-full rounded-sm transition-all ${i === spike ? 'bg-pen' : 'bg-ink/25 group-hover:bg-ink/50'}`} style={{ height: `${Math.max(14, (totals[i] / max) * 100)}%` }} /></div>
                  <div className={`flex justify-between text-[10.5px] mt-0.5 ${i === spike ? 'text-pen font-semibold' : 'text-muted'}`}>
                    <span>{monthLabel(m).slice(0, 3)}</span><span className="num">{totals[i]}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const cov = useAsync(() => data.coverage(), []);
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h)) || (h === '/queue' && path.startsWith('/exception'));
  return (
    <CoverageCtx.Provider value={{ coverage: cov.data, error: cov.error, reload: cov.reload }}>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 bg-sheet border-b border-rule no-print">
          <div className="max-w-[1320px] mx-auto px-4 lg:px-6 h-14 flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Tallyward home">
              <Logo />
              <span className="leading-none"><span className="cond text-[17px] tracking-tight">Tallyward</span>
                <span className="hidden md:block text-[10.5px] text-muted mt-0.5">Northwind Financial · 2nd line</span></span>
            </Link>
            <nav aria-label="Sections" className="hidden lg:flex items-center gap-1 ml-4">
              {TABS.map((t) => (
                <Link key={t.href} href={t.href} aria-current={active(t.href) ? 'page' : undefined}
                  className={`relative px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${active(t.href) ? 'text-ink' : 'text-muted hover:text-ink hover:bg-sheet-2'}`}>
                  {t.label}{active(t.href) && <span className="absolute left-3 right-3 -bottom-[11px] h-[2px] bg-pen rounded-full" />}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] border border-rule rounded-full pl-1 pr-2.5 py-0.5">
                <span className="w-5 h-5 rounded-full bg-sheet-2 grid place-items-center"><UserRound className="w-3 h-3" aria-hidden /></span>Control tester
              </span>
              <ModeSwitch />
              <ThemeToggle />
            </div>
          </div>
          <nav aria-label="Sections" className="lg:hidden flex gap-1 overflow-x-auto px-3 pb-2">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} aria-current={active(t.href) ? 'page' : undefined}
                className={`shrink-0 px-3 py-1 rounded-full text-[12.5px] font-medium border ${active(t.href) ? 'bg-ink text-on-ink border-ink' : 'border-rule text-muted'}`}>{t.label}</Link>
            ))}
          </nav>
        </header>
        <PeriodRibbon c={cov.data} />
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 lg:px-6 py-6">{children}</main>
        <footer className="border-t border-rule no-print">
          <div className="max-w-[1320px] mx-auto px-4 lg:px-6 py-4 text-[11.5px] text-muted flex flex-wrap gap-x-4 gap-y-1">
            <span>Tallyward and Northwind Financial are fictional. Synthetic data; illustrative logic. Not production software, and not audit, legal, regulatory or compliance advice.</span>
            <span>Built on Snowflake · not an official Snowflake product.</span>
          </div>
        </footer>
      </div>
    </CoverageCtx.Provider>
  );
}
