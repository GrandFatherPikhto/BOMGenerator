import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination for a flat list.
 * Returns the slice for the current page plus the state/handlers for the
 * pagination controls. The page resets when the list length or page size
 * changes.
 */
export function usePagination(items, initialPageSize = 20) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(0);
  }, [items.length, pageSize]);

  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize],
  );

  return { page, pageSize, setPage, setPageSize, pageItems };
}
