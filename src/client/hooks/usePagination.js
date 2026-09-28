import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Client-side pagination for a flat list.
 *
 * Returns the slice for the current page plus the state/handlers for the
 * pagination controls. `options` may carry:
 *  - `initialPage` / `initialPageSize` — restored from the persisted UI state;
 *  - `resetKey` — when given, the page resets only when this key (or the page
 *    size) changes, so the caller decides what "a different list" means (e.g.
 *    changed filters) and a restored page survives the first load. Without it
 *    the previous behaviour is kept: the page resets when the list length or the
 *    page size changes.
 *
 * A number as the second argument is still accepted as the initial page size.
 */
export function usePagination(items, options = {}) {
  const { initialPage = 0, initialPageSize = 20, resetKey } =
    typeof options === 'number' ? { initialPageSize: options } : options;

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const resetToken = resetKey === undefined ? `length:${items.length}` : `key:${resetKey}`;
  const previousToken = useRef(resetToken);
  const previousSize = useRef(pageSize);

  // Reset on a real context change, never on the first render: there the page
  // restored from the persisted UI state has to survive.
  useEffect(() => {
    if (previousToken.current !== resetToken || previousSize.current !== pageSize) {
      previousToken.current = resetToken;
      previousSize.current = pageSize;
      setPage(0);
    }
  }, [resetToken, pageSize]);

  // Keep the page inside the list once it is loaded; while the list is still
  // empty (loading) a restored page must not be clamped away.
  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const lastPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
    if (page > lastPage) {
      setPage(lastPage);
    }
  }, [page, items.length, pageSize]);

  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize],
  );

  return { page, pageSize, setPage, setPageSize, pageItems };
}
