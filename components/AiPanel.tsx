'use client';

// One AI moment: staged reasoning steps while the call runs, then a streaming-style reveal.
// In Sample mode the output is labeled "Sample AI response"; in Live mode it shows the model and latency.
import { Check, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Provenance } from '@/lib/types';
import { PoweredBy, Source } from './ui';

export function useStream(text: string | undefined, cps = 260) {
  const [st, setSt] = useState({ text, n: 0 });
  if (st.text !== text) setSt({ text, n: 0 }); // new text: restart the reveal (render-time reset)
  useEffect(() => {
    if (!text) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setInterval(() => setSt((x) => {
      const n = reduce ? text.length : Math.min(text.length, x.n + Math.ceil(cps / 30));
      if (n >= text.length) clearInterval(t);
      return { text, n };
    }), 33);
    return () => clearInterval(t);
  }, [text, cps]);
  const n = st.text === text ? st.n : 0;
  return { shown: text?.slice(0, n) ?? '', done: !!text && n >= text.length };
}

/** Steps advance on a timer while `busy`; all tick once the result arrives. */
export function Steps({ steps, busy }: { steps: string[]; busy: boolean }) {
  const [i, setI] = useState(0);
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) { setWasBusy(busy); if (busy) setI(0); } // restart when a new run begins
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 1500);
    return () => clearInterval(t);
  }, [busy, steps.length]);
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((s, k) => {
        const done = !busy || k < i; const now = busy && k === i;
        return (
          <li key={s} className={`flex items-center gap-2 text-[12.5px] transition-opacity ${k > i && busy ? 'opacity-35' : ''}`}>
            <span className={`w-4 h-4 rounded-full grid place-items-center border ${done ? 'bg-ai border-ai text-on-ink' : 'border-ai'}`}>
              {done ? <Check className="w-3 h-3" aria-hidden /> : now ? <span className="w-1.5 h-1.5 rounded-full bg-ai animate-ping" /> : null}
            </span>
            <span className={now ? 'text-ink font-medium' : 'text-muted'}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Minimal markdown: **bold** and paragraphs. */
export function Prose({ text, caret }: { text: string; caret?: boolean }) {
  const paras = text.split(/\n{2,}|\n(?=\*\*)/).filter((p) => p.trim());
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      {paras.map((p, i) => (
        <p key={i} className={caret && i === paras.length - 1 ? 'caret' : ''}>
          {p.split(/(\*\*[^*]+\*\*)/).map((s, j) => s.startsWith('**') ? <strong key={j}>{s.slice(2, -2)}</strong> : <span key={j}>{s}</span>)}
        </p>
      ))}
    </div>
  );
}

export function AiCard({ title, powered, steps, busy, result, text, footer, sources, idle }: {
  title: string; powered: ReactNode; steps: string[]; busy: boolean; result?: Provenance & { model?: string };
  text?: string; footer?: ReactNode; sources?: { label: string; detail?: string }[]; idle?: ReactNode;
}) {
  const { shown, done } = useStream(busy ? undefined : text);
  return (
    <section className="sheet overflow-hidden border-ai/30">
      <header className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 bg-ai-soft border-b border-ai/20">
        <div className="flex items-center gap-2 cond text-[14px] text-ai"><Sparkles className="w-4 h-4" aria-hidden />{title}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {result?.source === 'mock' && <span className="stamp text-ai !rotate-0" style={{ transform: 'none' }}>Sample AI response</span>}
          {result?.source === 'snowflake' && <Source p={result} />}
          {powered}
        </div>
      </header>
      <div className="p-4 space-y-3">
        {busy && <Steps steps={steps} busy />}
        {!busy && !text && idle}
        {!busy && text && <Prose text={shown} caret={!done} />}
        {!busy && done && sources?.length ? (
          <div className="rise pt-1">
            <div className="eyebrow mb-1.5">Sources</div>
            <ul className="flex flex-wrap gap-1.5">{sources.map((s) => <li key={s.label} className="text-[11.5px] border border-rule rounded-md px-2 py-0.5 bg-sheet-2" title={s.detail}>{s.label}</li>)}</ul>
          </div>
        ) : null}
        {!busy && done && footer && <div className="rise">{footer}</div>}
        {result?.model && !busy && <div className="text-[11px] text-muted">Model {result.model}</div>}
      </div>
    </section>
  );
}
export { PoweredBy };
