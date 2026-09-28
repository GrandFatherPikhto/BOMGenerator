import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { api } from '../lib/apiClient.js';
import {
  LinesTable,
  PacksCell,
  ProductCell,
  ShippingCell,
} from '../components/LinesTable.jsx';
import LineFiltersBar, { EMPTY_LINE_FILTERS } from '../components/LineFiltersBar.jsx';
import { formatMoney } from '../format.js';
import { compileLineFilter, filterBlocks } from '../../shared/index.js';

/**
 * "Общие закупки": the shared need of every board position marked "Общие",
 * aggregated by match key. Here (and only here) the product, packages and
 * shipping of those rows are chosen; the seller follows from the product, and
 * the "Продавец" control narrows the product list.
 */
export default function CommonPurchasesPage() {
  const [mode, setMode] = useState('merged');
  const [view, setView] = useState(null);
  const [products, setProducts] = useState([]);
  const [sellerFilter, setSellerFilter] = useState('');
  const [filters, setFilters] = useState(EMPTY_LINE_FILTERS);
  const [error, setError] = useState(null);

  // Switching between the merged list and the by-board breakdown resets the
  // filters: the rows behind them change completely.
  useEffect(() => {
    setFilters(EMPTY_LINE_FILTERS);
  }, [mode]);

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
  const filter = useMemo(() => compileLineFilter(filters), [filters]);
  const visibleBlocks = useMemo(
    () => filterBlocks(view?.blocks ?? [], filter.match),
    [view, filter],
  );

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  // The seller filter lists only sellers that actually have products.
  const sellerOptions = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (product.sellerId && !map.has(product.sellerId)) {
        map.set(product.sellerId, product.sellerName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

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
      render: (row) => productOf(row)?.sellerName ?? '',
    },
    {
      id: 'product',
      label: 'Товар',
      render: (row) => (
        <ProductCell
          row={row}
          products={products}
          sellerFilter={sellerFilter}
          onChange={(c) => patch(row, c)}
        />
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
            filters={filters}
            onChange={(changes) =>
              setFilters((previous) => ({ ...previous, ...changes }))
            }
          />

          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              select
              size="small"
              label="Продавец (фильтр)"
              value={sellerFilter}
              onChange={(event) => setSellerFilter(event.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Все продавцы</MenuItem>
              {sellerOptions.map((seller) => (
                <MenuItem key={seller.id} value={seller.id}>
                  {seller.name}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              Фильтр сужает список товаров в колонке «Товар».
            </Typography>
          </Stack>

          <LinesTable
            blocks={visibleBlocks}
            columns={columns}
            resetKey={`${mode}:${JSON.stringify(filters)}`}
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
