import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { api } from '../lib/apiClient.js';
import { sellerOptionsFromProducts } from '../lib/sellerOptions.js';
import {
  LinesTable,
  NotPurchasedCell,
  PAGE_SIZE_DEFAULT,
  PacksCell,
  ProductCell,
  SellerCell,
  ShippingCell,
} from '../components/LinesTable.jsx';
import LineFiltersBar, { EMPTY_LINE_FILTERS } from '../components/LineFiltersBar.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { useUiState } from '../hooks/useUiState.js';
import { formatMoney } from '../format.js';
import { activeSellerId, compileLineFilter, filterBlocks } from '../../shared/index.js';

/**
 * Defaults of the "common" UI-state section. Module-level on purpose: it is a
 * dependency of the `useUiState` memo.
 */
const COMMON_UI_DEFAULTS = {
  mode: 'merged',
  page: 0,
  size: PAGE_SIZE_DEFAULT,
  filters: EMPTY_LINE_FILTERS,
};

/**
 * "Общие закупки": the shared need of every board position marked "Общие",
 * aggregated by match key. Here (and only here) the product, packages and
 * shipping of those rows are chosen. A row's seller can be picked directly
 * (narrows the "Товар" list and clears the current product, see SellerCell)
 * or left to follow the chosen product; the "Продавец" filter in the bar
 * above is a separate, page-wide control that only keeps matching rows.
 */
export default function CommonPurchasesPage() {
  // Restored context: the mode, the row filters and the page survive a switch to
  // another tab.
  const [ui, updateUi] = useUiState('common', COMMON_UI_DEFAULTS);
  const [mode, setMode] = useState(ui.mode);
  const [view, setView] = useState(null);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(ui.filters);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [viewData, productList] = await Promise.all([
        api.commonPurchases.list(mode),
        api.products.list(),
      ]);
      setView(viewData);
      setProducts(productList);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(row, changes) {
    try {
      await api.commonPurchases.setOverride({ matchKey: row.matchKey, ...changes });
      await load();
    } catch (patchError) {
      setError(patchError.message);
    }
  }

  const rows = useMemo(
    () =>
      (view?.blocks ?? [])
        .filter((block) => block.kind === 'line')
        .map((block) => block.line),
    [view],
  );

  // A seller picked per row, same purpose as on the board/all-boards purchase
  // tables — see SellerCell's doc comment. Keyed by matchKey.
  const [sellerOverrides, setSellerOverrides] = useState({});

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  // Every shop with products in the catalogue is offered, so a seller can be
  // chosen before any row has a product assigned.
  const sellerOptions = useMemo(
    () => sellerOptionsFromProducts(products),
    [products],
  );

  const activeSeller = useMemo(
    () => activeSellerId(sellerOptions, filters.seller),
    [sellerOptions, filters.seller],
  );
  const rowSeller = (row) =>
    sellerOverrides[row.matchKey] ?? row.sellerId ?? (activeSeller || '');

  const effectiveFilters = useMemo(
    () => (activeSeller === filters.seller ? filters : { ...filters, seller: '' }),
    [filters, activeSeller],
  );

  const filter = useMemo(() => compileLineFilter(effectiveFilters), [effectiveFilters]);
  const visibleBlocks = useMemo(
    () => filterBlocks(view?.blocks ?? [], filter.match),
    [view, filter],
  );

  // The pagination reacts to this key; a restored page survives the first load.
  const resetKey = `${mode}:${JSON.stringify(effectiveFilters)}`;
  const { page, pageSize, setPage, setPageSize } = usePagination(rows, {
    initialPage: ui.page,
    initialPageSize: ui.size || PAGE_SIZE_DEFAULT,
    resetKey,
  });

  // Switching between the merged list and the by-board breakdown resets the
  // filters: the rows behind them change completely. Skipped on the first render
  // so the restored filters are not wiped.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      setFilters(EMPTY_LINE_FILTERS);
    }
  }, [mode]);

  // Persist the screen context so a switch to another tab does not reset it.
  useEffect(() => {
    updateUi({ mode });
  }, [mode, updateUi]);

  useEffect(() => {
    updateUi({ filters });
  }, [filters, updateUi]);

  useEffect(() => {
    updateUi({ page, size: pageSize });
  }, [page, pageSize, updateUi]);

  const columns = [
    { id: 'value', label: 'Наименование' },
    { id: 'footprint', label: 'Корпус/Footprint' },
    { id: 'totalQty', label: 'Нужно всего', align: 'right', sx: { fontWeight: 'bold' } },
  ];

  if (mode === 'by_board' && view) {
    for (const boardName of view.boardNames) {
      columns.push({
        id: `board-${boardName}`,
        label: boardName,
        align: 'right',
        render: (row) => row.byBoard?.[boardName] ?? '',
      });
    }
  }

  columns.push(
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) => (
        <SellerCell
          value={rowSeller(row)}
          options={sellerOptions}
          disabled={Boolean(row.notPurchased)}
          onChange={(sellerId) => {
            setSellerOverrides((previous) => ({ ...previous, [row.matchKey]: sellerId }));
            if (row.productId) {
              patch(row, { productId: null });
            }
          }}
        />
      ),
    },
    {
      id: 'product',
      label: 'Товар',
      render: (row) => (
        <ProductCell
          row={row}
          products={products}
          sellerFilter={rowSeller(row)}
          disabled={Boolean(row.notPurchased)}
          onChange={(c) => patch(row, c)}
        />
      ),
    },
    {
      id: 'notPurchased',
      label: 'Не закупается',
      render: (row) => (
        <NotPurchasedCell row={row} onChange={(c) => patch(row, c)} />
      ),
    },
    {
      id: 'packQty',
      label: 'В упаковке',
      align: 'right',
      render: (row) => productOf(row)?.packQty ?? '',
    },
    {
      id: 'packPrice',
      label: 'Цена упаковки',
      align: 'right',
      render: (row) => formatMoney(productOf(row)?.packPrice),
    },
    {
      id: 'packs',
      label: 'Упаковок',
      align: 'right',
      render: (row) => <PacksCell row={row} onChange={(c) => patch(row, c)} />,
    },
    {
      id: 'shipping',
      label: 'Доставка',
      align: 'right',
      render: (row) => <ShippingCell row={row} onChange={(c) => patch(row, c)} />,
    },
    {
      id: 'cost',
      label: 'Стоимость',
      align: 'right',
      render: (row) => formatMoney(row.cost),
    },
  );

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Общие закупки</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(event, value) => value && setMode(value)}
        >
          <ToggleButton value="merged">Единый список</ToggleButton>
          <ToggleButton value="by_board">С разбивкой по платам</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!view ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <LineFiltersBar
            rows={rows}
            filters={effectiveFilters}
            onChange={(changes) =>
              setFilters((previous) => ({ ...previous, ...changes }))
            }
            sellerOptions={sellerOptions}
          />

          <LinesTable
            blocks={visibleBlocks}
            columns={columns}
            resetKey={resetKey}
            rowSx={(row) =>
              row.notPurchased ? { backgroundColor: '#eeeeee', color: 'text.disabled' } : undefined
            }
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
          <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
            <Stack direction="row" justifyContent="flex-end" spacing={4}>
              <Typography>
                Доставка: <strong>{formatMoney(view.totals.shippingCost)}</strong>
              </Typography>
              <Typography variant="h6">
                Итого: {formatMoney(view.totals.cost)}
              </Typography>
            </Stack>
          </Paper>
        </>
      )}
    </Box>
  );
}
