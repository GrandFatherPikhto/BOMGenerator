// Tests for the client-side pagination hook.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePagination } from '../../src/client/hooks/usePagination.js';

const items = Array.from({ length: 45 }, (_, index) => index + 1);

describe('usePagination', () => {
  it('returns the first page by default', () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.page).toBe(0);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.pageItems).toHaveLength(20);
    expect(result.current.pageItems[0]).toBe(1);
  });

  it('slices the requested page', () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(2));
    expect(result.current.pageItems).toHaveLength(5);
    expect(result.current.pageItems[0]).toBe(41);
  });

  it('resets to the first page when the list length changes', () => {
    const { result, rerender } = renderHook(({ list }) => usePagination(list), {
      initialProps: { list: items },
    });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ list: items.slice(0, 5) });
    expect(result.current.page).toBe(0);
  });

  it('resets to the first page when the page size changes', () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(2));
    act(() => result.current.setPageSize(10));
    expect(result.current.page).toBe(0);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it('keeps the given initial page on the first render', () => {
    const { result } = renderHook(() =>
      usePagination(items, { initialPage: 2, initialPageSize: 10 }),
    );
    expect(result.current.page).toBe(2);
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageItems[0]).toBe(21);
  });

  it('still accepts a bare number as the initial page size', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    expect(result.current.pageSize).toBe(10);
  });

  it('with a resetKey keeps a restored page across the first load', () => {
    const { result, rerender } = renderHook(
      ({ list, key }) =>
        usePagination(list, { initialPage: 2, initialPageSize: 10, resetKey: key }),
      { initialProps: { list: [], key: 'shop' } },
    );
    expect(result.current.page).toBe(2);

    rerender({ list: items, key: 'shop' });
    expect(result.current.page).toBe(2);
  });

  it('with a resetKey resets when the key changes', () => {
    const { result, rerender } = renderHook(
      ({ key }) =>
        usePagination(items, { initialPage: 2, initialPageSize: 10, resetKey: key }),
      { initialProps: { key: 'shop' } },
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    rerender({ key: 'all' });
    expect(result.current.page).toBe(0);
  });

  it('clamps a restored page that is past the end of the loaded list', () => {
    const { result } = renderHook(() =>
      usePagination(items, { initialPage: 4, initialPageSize: 20 }),
    );
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems[0]).toBe(41);
  });
});
