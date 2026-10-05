"use client";

import { useEffect, useRef, useState } from "react";

type Result<T> = { key: string; data: T } | { key: string; error: unknown };

/**
 * Loads `load(signal)` whenever `key` changes (`null` loads nothing), cancels
 * the previous request and keeps only the answer for the current key, so a
 * slow response never overwrites a newer selection.
 */
export function useApi<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    loader
      .current(controller.signal)
      .then((data) => setResult({ key, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      });
    return () => controller.abort();
  }, [key, attempt]);

  const current = result && result.key === key ? result : null;
  return {
    data: current && "data" in current ? current.data : null,
    error: current && "error" in current ? current.error : null,
    loading: key !== null && current === null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}
