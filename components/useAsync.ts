'use client';

import { useCallback, useEffect, useState } from 'react';

/** Load async data and reload when deps change. With `keep`, a reload keeps the last data on screen. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { keep?: boolean } = {}) {
  const key = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    fn().then((data) => live && setState({ key, data }), (e) => live && setState({ key, error: String(e?.message ?? e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  if (state.key === key) return { data: state.data, error: state.error, loading: false, reload };
  return { data: opts.keep ? state.data : undefined, error: undefined, loading: true, reload };
}
