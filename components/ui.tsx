'use client';

// Tallyward UI kit. Tokens live in app/globals.css; see docs/DESIGN.md.
import { AlertTriangle, Inbox, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { Disposition, Provenance } from '@/lib/types';

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--ink)" />
      <path d="M7 6v12M11 6v12M15 6v12" stroke="var(--on-ink)" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M5.5 13.2l3.6 3.4L18.8 7" fill="none" stroke="#E4572E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sheet({ title, eyebrow, right, children, className = '', pad = true }: {
  title?: ReactNode; eyebrow?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`sheet ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 flex-wrap px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="cond text-[15px] leading-tight">{title}</h2>}
          </div>
          {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
        </header>
      )}
      <div className={pad ? 'px-4 pb-4' : ''}>{children}</div>
    </section>
  );
}

/** Counts up once on first render (instant with reduced motion). */
export function Counter({ value, format = (n) => Math.round(n).toLocaleString('en-US') }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    done.current = true;
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 700); setShown(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{format(shown)}</span>;
}

export function Kpi({ label, value, format, note, delta, deltaTone = 'muted', spark, sparkColor = 'var(--ink)', icon }: {
  label: string; value: number; format?: (n: number) => string; note?: ReactNode; delta?: ReactNode;
  deltaTone?: 'pen' | 'tick' | 'feed' | 'muted'; spark?: (number | null)[]; sparkColor?: string; icon?: ReactNode;
}) {
  return (
    <div className="sheet p-4 relative overflow-hidden group transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2"><span className="eyebrow">{label}</span><span className="text-muted">{icon}</span></div>
      <div className="flex items-end justify-between gap-3 mt-1.5">
        <div className="cond text-[30px] leading-none"><Counter value={value} format={format} /></div>
        {spark && (
          <div className="w-24 h-9 shrink-0" aria-hidden>
            <ResponsiveContainer><LineChart data={spark.map((v, i) => ({ i, v }))}><Line dataKey="v" stroke={sparkColor} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls /></LineChart></ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-2 text-[12px] text-muted flex items-center gap-2 flex-wrap">
        {delta && <span className={`font-semibold text-${deltaTone}`}>{delta}</span>}{note}
      </div>
    </div>
  );
}

type Tone = 'pen' | 'tick' | 'feed' | 'waive' | 'ai' | 'muted';
export function Pill({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const bg = tone === 'muted' ? 'bg-sheet-2 text-muted border border-rule' : `bg-${tone}-soft text-${tone}`;
  return <span className={`pill ${bg}`} title={title}>{children}</span>;
}
// Tailwind needs the literal class names to generate them.
// bg-pen-soft text-pen bg-tick-soft text-tick bg-feed-soft text-feed bg-waive-soft text-waive bg-ai-soft text-ai

export const dispositionTone = (d?: string | null): Tone => d === 'True issue' ? 'pen' : d === 'Data issue' ? 'feed' : d === 'Accepted risk' ? 'waive' : 'muted';
export function Stamp({ d }: { d: Disposition | string }) {
  return <span className={`stamp text-${dispositionTone(d)}`}>{d}</span>;
}
export function Severity({ s }: { s: string }) {
  return <Pill tone={s === 'High' ? 'pen' : 'waive'}><span className="w-1.5 h-1.5 rounded-full bg-current" />{s}</Pill>;
}

export function PoweredBy({ children, preview }: { children: ReactNode; preview?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted border border-rule rounded-full px-2 py-0.5 bg-sheet whitespace-nowrap">
      <Zap className="w-3 h-3 text-pen" aria-hidden />Powered by {children}{preview && <span className="text-waive font-semibold"> · Preview</span>}
    </span>
  );
}

export function Source({ p }: { p?: Provenance }) {
  if (!p) return null;
  return p.source === 'snowflake'
    ? <span className="text-[11px] text-muted num" title={`Role ${p.role}`}>Live · {p.latencyMs?.toLocaleString()} ms</span>
    : <span className="text-[11px] text-muted">Sample data</span>;
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skel ${className}`} aria-hidden />; }
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div role="alert" className="sheet p-5 border-pen/40 flex gap-3 items-start">
      <AlertTriangle className="w-5 h-5 text-pen shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <div className="cond text-[15px]">Snowflake returned an error</div>
        <p className="text-[13px] text-muted mt-1 break-words">{error}</p>
        <p className="text-[12px] text-muted mt-2">Live mode never falls back to sample data. Check the connection in <code>.env.local</code>, or switch to Sample.</p>
        {retry && <button className="btn btn-sm mt-3" onClick={retry}>Try again</button>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <Inbox className="w-7 h-7 mx-auto text-muted" aria-hidden />
      <div className="cond text-[15px] mt-2">{title}</div>
      {children && <p className="text-[13px] text-muted mt-1 max-w-sm mx-auto">{children}</p>}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-label="Close panel" />
      <div className={`drawer relative h-full w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} bg-paper border-l border-rule shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-rule bg-sheet">
          <div className="min-w-0 cond text-[16px] truncate">{title}</div>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Light SQL highlighting for display only (keywords, strings, numbers, comments). */
const KW = /\b(SELECT|FROM|WHERE|JOIN|USING|AND|OR|NOT|IS|NULL|IN|AS|ON|BETWEEN|COUNT|IFF|DATEADD|DATEDIFF|OBJECT_CONSTRUCT_KEEP_NULL|AT|TIMESTAMP|DATE|GROUP|BY|ORDER|LIMIT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|UPDATE|SET|VALUES)\b/g;
export function SqlBlock({ sql, className = '' }: { sql: string; className?: string }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = esc(sql).split(/('[^']*')/).map((part, i) => i % 2 ? `<span class="s">${part}</span>`
    : part.replace(KW, '<span class="k">$1</span>').replace(/(\?|\b\d[\d,.]*\b)/g, '<span class="n">$1</span>')).join('');
  return <pre className={`code ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sheet px-3 py-2 text-[12px]">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />{p.name}<span className="num ml-auto pl-3 font-semibold">{fmt ? fmt(p.value) : p.value?.toLocaleString()}</span></div>
      ))}
    </div>
  );
}

export const usd = (n: unknown) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
