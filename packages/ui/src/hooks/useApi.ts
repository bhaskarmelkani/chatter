import { useCallback, useEffect, useState } from "react";

const BASE = "/api";

/* ------------------------------------------------------------------ */
/*  Low-level fetch wrapper                                           */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export { apiFetch };

/* ------------------------------------------------------------------ */
/*  Generic data-fetching hook                                        */
/* ------------------------------------------------------------------ */

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(path: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

/* ------------------------------------------------------------------ */
/*  Polling variant                                                   */
/* ------------------------------------------------------------------ */

export function usePollingApi<T>(path: string, intervalMs = 5000): UseApiResult<T> {
  const result = useApi<T>(path);

  useEffect(() => {
    const id = setInterval(result.refetch, intervalMs);
    return () => clearInterval(id);
  }, [result.refetch, intervalMs]);

  return result;
}
