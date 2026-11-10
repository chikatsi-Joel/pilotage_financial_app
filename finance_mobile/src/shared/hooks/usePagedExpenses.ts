import { useCallback, useRef, useState } from "react";

import { expenses as expensesApi } from "../api/expenses";
import type { Expense } from "../types";
import { appendUnique } from "../utils/paging";

interface Options {
  userId: string | null;
  from: string;
  to: string;
  categoryId?: string;
  /** Recherche côté serveur (note ou nom de catégorie). */
  q?: string;
  pageSize?: number;
  /** Faux : aucune requête (ex. catégorie pas encore connue). */
  enabled?: boolean;
}

/**
 * Charge les dépenses page par page (curseur serveur).
 * `reload` repart de la première page ; `loadMore` ajoute la suivante.
 * Une réponse arrivée après un changement de filtre est ignorée.
 */
export function usePagedExpenses({
  userId,
  from,
  to,
  categoryId,
  q,
  pageSize = 30,
  enabled = true,
}: Options) {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);

  const cursor = useRef<string | null>(null);
  const generation = useRef(0);
  const moreRef = useRef(false);
  const busyRef = useRef(false);

  const query = q?.trim() || undefined;

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const gen = ++generation.current;
      cursor.current = null;
      busyRef.current = false;
      if (!userId || !enabled) {
        moreRef.current = false;
        setItems([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      setLoadingMore(false);
      setError(false);
      try {
        const page = await expensesApi.list(userId, {
          from,
          to,
          categoryId,
          q: query,
          limit: pageSize,
        });
        if (gen !== generation.current) return;
        cursor.current = page.next_cursor;
        moreRef.current = page.has_more && !!page.next_cursor;
        setItems(page.items);
        setHasMore(moreRef.current);
      } catch {
        if (gen !== generation.current) return;
        setError(true);
        if (!opts?.silent) {
          moreRef.current = false;
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [userId, enabled, from, to, categoryId, query, pageSize],
  );

  const loadMore = useCallback(async () => {
    if (!userId || !enabled || !moreRef.current || busyRef.current || !cursor.current) return;
    const gen = generation.current;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const page = await expensesApi.list(userId, {
        from,
        to,
        categoryId,
        q: query,
        cursor: cursor.current,
        limit: pageSize,
      });
      if (gen !== generation.current) return;
      cursor.current = page.next_cursor;
      moreRef.current = page.has_more && !!page.next_cursor;
      setItems((prev) => appendUnique(prev, page.items));
      setHasMore(moreRef.current);
    } catch {
      if (gen === generation.current) setError(true);
    } finally {
      if (gen === generation.current) {
        busyRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [userId, enabled, from, to, categoryId, query, pageSize]);

  return { items, loading, loadingMore, hasMore, error, reload, loadMore };
}
