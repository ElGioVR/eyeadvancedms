import { useEffect, useRef, useCallback } from 'react';

const STORAGE_PREFIX = 'autosave:';

/**
 * Autosave hook: debounces writes to localStorage.
 * Returns { loadDraft, clearDraft } for manual control.
 */
export function useAutosave<T>(
  key: string,
  data: T,
  delay: number = 1500,
): { loadDraft: () => T | null; clearDraft: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // Debounced save
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {}
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, data, delay, storageKey]);

  const loadDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return { loadDraft, clearDraft };
}
