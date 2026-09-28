import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import AllBoardsPurchasesView from '../components/AllBoardsPurchasesView.jsx';
import { PAGE_SIZE_DEFAULT } from '../components/LinesTable.jsx';
import PurchaseBoardView from '../components/PurchaseBoardView.jsx';
import { api } from '../lib/apiClient.js';

/**
 * Read the persisted filters back from the URL. The seller is deliberately NOT
 * persisted: it belongs to one table, so keeping it in the URL made it "leak"
 * onto other boards/tabs where it was never chosen.
 */
function readFilters(params) {
  return {
    value: params.get('value') ?? '',
    valueRegex: params.get('valueRe') === '1',
    valueCaseSensitive: params.get('valueCase') === '1',
    footprint: params.get('fp') ?? '',
    footprintRegex: params.get('fpRe') === '1',
    footprintCaseSensitive: params.get('fpCase') === '1',
    qtyOp: params.get('qtyOp') ?? '',
    qty: params.get('qty') ?? '',
  };
}

/** Map the filters to their (short) URL parameter names. */
function filtersToParams(filters) {
  return {
    value: filters.value,
    valueRe: filters.valueRegex ? '1' : '',
    valueCase: filters.valueCaseSensitive ? '1' : '',
    fp: filters.footprint,
    fpRe: filters.footprintRegex ? '1' : '',
    fpCase: filters.footprintCaseSensitive ? '1' : '',
    qtyOp: filters.qtyOp,
    qty: filters.qty,
  };
}

/**
 * "Закупки": the purchase table of the selected board ("По платам") or a summary
 * of every enabled board ("Все"). The active tab, board, filters and pagination
 * live in the URL, so they survive tab switches, navigation and edits.
 */
export default function PurchasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'all' ? 'all' : 'boards';
  const boardId = searchParams.get('board') || '';
  const page = Math.max(0, Number(searchParams.get('page')) || 0);
  const pageSize = Number(searchParams.get('size')) || PAGE_SIZE_DEFAULT;
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const [boards, setBoards] = useState([]);
  const [products, setProducts] = useState([]);
  const [view, setView] = useState(null);
  const [allView, setAllView] = useState(null);
  const [count, setCount] = useState(1);
  // The seller filter is local to the table and never persisted (see readFilters).
  const [seller, setSeller] = useState('');
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // What the views actually filter by: the URL-backed filters plus the local seller.
  const viewFilters = useMemo(() => ({ ...filters, seller }), [filters, seller]);

  /** Merge a patch into the URL, preserving every other parameter. */
  const updateParams = useCallback(
    (patch, options = { replace: true }) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '') {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        options,
      );
    },
    [setSearchParams],
  );

  // Drop a "seller" left in the URL by an older link: it is never persisted now.
  useEffect(() => {
    if (searchParams.has('seller')) {
      updateParams({ seller: '' });
    }
  }, [searchParams, updateParams]);

  useEffect(() => {
    (async () => {
      try {
        const [boardList, productList] = await Promise.all([
          api.boards.list(),
          api.products.list(),
        ]);
        // Only enabled boards take part in the purchase work.
        setBoards(boardList.filter((board) => !board.isService && board.enabled));
        setProducts(productList);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Fall back to the first enabled board when none (or a disabled one) is selected.
  useEffect(() => {
    if (!loaded || tab !== 'boards' || boards.length === 0) {
      return;
    }
    const selectedExists = boards.some((board) => board.id === boardId);
    if (!selectedExists) {
      updateParams({ board: boards[0].id });
    }
  }, [loaded, tab, boardId, boards, updateParams]);

  const loadView = useCallback(async () => {
    if (tab === 'all') {
      try {
        setAllView(await api.boards.view('all'));
        setError(null);
      } catch (loadError) {
        setError(loadError.message);
        setAllView(null);
      }
      return;
    }
    if (!boardId) {
      setView(null);
      return;
    }
    try {
      const data = await api.boards.view(boardId);
      setView(data);
      setCount(data.board.count);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
      setView(null);
    }
  }, [tab, boardId]);

  useEffect(() => {
    loadView();
  }, [loadView]);

  async function patchLine(lineId, changes) {
    try {
      await api.boards.updateLine(boardId, lineId, changes);
      await loadView();
    } catch (patchError) {
      setError(patchError.message);
    }
  }

  async function patchLines(lineIds, changes) {
    try {
      await api.boards.updateLines(lineIds, changes);
      await loadView();
    } catch (patchError) {
      setError(patchError.message);
    }
  }

  async function saveCount() {
    try {
      await api.boards.update(boardId, { count: Number(count) });
      await loadView();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  // The handlers are memoised so the controlled pagination in LinesTable does
  // not see a new callback on every render (which would trigger extra renders).
  const changeFilters = useCallback(
    (changes) => {
      if ('seller' in changes) {
        setSeller(changes.seller);
      }
      const next = { ...filters, ...changes };
      delete next.seller;
      updateParams({ ...filtersToParams(next), page: '' });
    },
    [filters, updateParams],
  );

  // The seller belongs to one table: switching tab drops it (the other board/tab
  // may not even have that seller).
  const changeTab = useCallback(
    (next) => {
      setSeller('');
      updateParams({ tab: next === 'all' ? 'all' : '', seller: '', page: '' });
    },
    [updateParams],
  );

  const changePage = useCallback(
    (next) => {
      updateParams({ page: next > 0 ? next : '' });
    },
    [updateParams],
  );

  const changePageSize = useCallback(
    (next) => {
      updateParams({ size: next === PAGE_SIZE_DEFAULT ? '' : next, page: '' });
    },
    [updateParams],
  );

  /** Link to a board keeping the value/footprint/quantity filters, but not the
   * seller (it is specific to the board it was chosen in). */
  const boardHref = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      next.delete('page');
      next.delete('seller');
      next.set('board', id);
      return `/purchases?${next.toString()}`;
    },
    [searchParams],
  );

  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (boards.length === 0) {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Закупки
        </Typography>
        <Alert severity="info">
          Нет импортированных плат. Импортируйте CSV на вкладке «Платы».
          <Box sx={{ mt: 1 }}>
            <Button component={RouterLink} to="/" variant="outlined" size="small">
              Перейти к платам
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}
      >
        <Typography variant="h5" sx={{ mr: 1 }}>
          Закупки
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tab}
          onChange={(event, value) => value && changeTab(value)}
        >
          <ToggleButton value="boards">По платам</ToggleButton>
          <ToggleButton value="all">Все</ToggleButton>
        </ToggleButtonGroup>

        {tab === 'boards' && (
          <>
            <TextField
              select
              size="small"
              label="Плата"
              value={boardId}
              onChange={(event) => {
                setSeller('');
                updateParams({ board: event.target.value, seller: '', page: '' });
              }}
              sx={{ minWidth: 260 }}
            >
              {boards.map((board) => (
                <MenuItem key={board.id} value={board.id}>
                  {board.name} ({board.lineCount} поз.)
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label="Плат в изделии"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              sx={{ width: 160 }}
            />
            <Button variant="outlined" onClick={saveCount}>
              Применить
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="outlined"
              component="a"
              href={`/api/boards/${boardId}/export?format=xlsx`}
            >
              Экспорт в Excel
            </Button>
            <Button
              variant="outlined"
              component="a"
              href={`/api/boards/${boardId}/export?format=csv`}
            >
              Экспорт в CSV
            </Button>
          </>
        )}

        {tab === 'all' && (
          <Typography variant="caption" color="text.secondary">
            Сводная таблица по всем включённым платам.
          </Typography>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {tab === 'all' ? (
        allView ? (
          <AllBoardsPurchasesView
            view={allView}
            products={products}
            filters={viewFilters}
            onFiltersChange={changeFilters}
            onPatchLines={patchLines}
            page={page}
            pageSize={pageSize}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            boardHref={boardHref}
          />
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )
      ) : view ? (
        <PurchaseBoardView
          board={view.board}
          blocks={view.blocks}
          totals={view.totals}
          products={products}
          onPatchLine={patchLine}
          filters={viewFilters}
          onFiltersChange={changeFilters}
          page={page}
          pageSize={pageSize}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
