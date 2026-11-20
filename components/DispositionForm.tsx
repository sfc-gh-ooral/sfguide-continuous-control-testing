'use client';

// Human disposition for one or many exceptions. A note is required for every disposition.
import { useState } from 'react';
import { data } from '@/lib/client';
import { DISPOSITIONS, type Disposition } from '@/lib/types';

export function DispositionForm({ ids, initial, onDone, compact = false }: { ids: string[]; initial?: Disposition; onDone: (n: number) => void; compact?: boolean }) {
  const [disposition, setDisposition] = useState<Disposition | ''>(initial ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ready = !!disposition && note.trim().length >= 5 && ids.length > 0;
  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError(undefined);
    try { const r = await data.dispose(ids, disposition as Disposition, note.trim()); onDone(r.updated); setNote(''); }
    catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };
  return (
    <div className={`flex ${compact ? 'flex-col' : 'flex-col md:flex-row md:items-start'} gap-2`}>
      <fieldset className="flex gap-1 flex-wrap" aria-label="Disposition">
        {DISPOSITIONS.map((d) => (
          <button key={d} type="button" className="btn !py-1.5" aria-pressed={disposition === d} onClick={() => setDisposition(d)}
            style={disposition === d ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>{d}</button>
        ))}
      </fieldset>
      <label className="flex-1 min-w-0">
        <span className="sr-only">Disposition note (required)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={compact ? 3 : 1} placeholder="Note (required): what you checked and why"
          className="w-full text-sm rounded-lg border px-3 py-1.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      </label>
      <button className="btn btn-primary" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Saving…' : `Disposition ${ids.length} exception${ids.length === 1 ? '' : 's'}`}
      </button>
      {error && <div role="alert" className="text-xs" style={{ color: 'var(--negative)' }}>{error}</div>}
    </div>
  );
}
