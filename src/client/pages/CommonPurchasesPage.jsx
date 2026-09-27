import { useCallback, useEffect, useState } from 'react';

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
import { LinesTable, SellerCell, ShippingCell } from '../components/LinesTable.jsx';
import { formatMoney } from '../format.js';

export default function CommonPurchasesPage() {
  const [mode, setMode] = useState('merged');
  const [view, setView] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [viewData, sellerList] = await Promise.all([
        api.commonPurchases.list(mode),
        api.sellers.list(),
      ]);
      setView(viewData);
      setSellers(sellerList);
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

  const sellerMap = new Map(sellers.map((seller) => [seller._id, seller]));
  const sellerOf = (row) => (row.sellerId ? sellerMap.get(row.sellerId) : null);

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
        <SellerCell row={row} sellers={sellers} onChange={(c) => patch(row, c)} />
      ),
    },
    {
      id: 'packQty',
      label: 'В упаковке',
      align: 'right',
      render: (row) => sellerOf(row)?.packQty ?? '',
    },
    { id: 'packs', label: 'Упаковок', align: 'right', render: (row) => row.packs ?? '' },
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
          <LinesTable blocks={view.blocks} columns={columns} />
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
