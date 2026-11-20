'use client';

import { useEffect, useState } from 'react';

/** Load async data and reload when deps change. Results are keyed to their deps, so stale data never shows. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    fn().then((data) => live && setState({ key, data }), (e) => live && setState({ key, error: String(e?.message ?? e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error, loading: false } : { data: undefined, error: undefined, loading: true };
}
