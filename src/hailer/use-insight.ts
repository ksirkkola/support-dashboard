import { useEffect, useState } from 'react';
import { useApp } from './use-app';

function parseInsight<T>(data: { headers: string[]; rows: unknown[][] }): T[] {
  return data.rows.map(row => {
    const r: Record<string, unknown> = {};
    data.headers.forEach((h, i) => { r[h] = row[i]; });
    return r as unknown as T;
  });
}

// Small shared fetch-and-parse hook — every panel in this app was independently
// re-implementing this same insight.data + header-zip pattern; this just avoids
// copy-pasting it again for ThermDAC / Time Tracking.
export function useInsight<T>(insightId: string, refreshKey = 0) {
  const { hailer, inside } = useApp();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inside || !hailer) return;
    setLoading(true);
    hailer.insight.data(insightId, { update: true })
      .then(data => {
        setRows(parseInsight<T>(data));
        setError(null);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inside, hailer, insightId, refreshKey]);

  return { rows, loading, error };
}
