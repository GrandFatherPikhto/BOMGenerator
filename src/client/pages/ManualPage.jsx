import { useCallback, useEffect, useMemo, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { api } from '../lib/apiClient.js';
import {
  CommonCell,
  LinesTable,
  ProductCell,
  QuantityCell,
  ShippingCell,
} from '../components/LinesTable.jsx';
import { formatMoney } from '../format.js';

/**
 * "Докупить": hand-made positions stored on the service board. The product is
 * picked the same way as in the purchase tables (searchable dropdown, seller
 * derived from the product).
 */
export default function ManualPage() {
  const [serviceId, setServiceId] = useState(null);
  const [view, setView] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({ value: '', footprint: '', qty: 1, reference: '' });

  const load = useCallback(async () => {
    try {
      const boards = await api.boards.list();
      const service = boards.find((board) => board.isService);
      setServiceId(service?.id ?? null);
      const [viewData, productList] = await Promise.all([
        service ? api.boards.view(service.id) : Promise.resolve(null),
        api.products.list(),
      ]);
      setView(viewData);
      setProducts(productList);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(row, changes) {
    try {
      await api.boards.updateLine(serviceId, row.id, changes);
      await load();
    } catch (patchError) {
      setError(patchError.message);
    }
  }

  async function remove(row) {
    try {
      await api.boards.deleteLine(serviceId, row.id);
      await load();
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function addLine() {
    try {
      await api.boards.addLine(serviceId, draft);
      setDialogOpen(false);
      setDraft({ value: '', footprint: '', qty: 1, reference: '' });
      await load();
    } catch (addError) {
      setError(addError.message);
    }
  }

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  const columns = [
    { id: 'reference', label: 'Обозначение' },
    { id: 'value', label: 'Наименование' },
    { id: 'footprint', label: 'Корпус/Footprint' },
    {
      id: 'qty',
      label: 'Кол-во',
      align: 'right',
      render: (row) => <QuantityCell row={row} onChange={(c) => patch(row, c)} />,
    },
    {
      id: 'common',
      label: 'Общие',
      render: (row) => <CommonCell row={row} onChange={(c) => patch(row, c)} />,
    },
    {
      id: 'product',
      label: 'Товар',
      render: (row) => (
        <ProductCell row={row} products={products} onChange={(c) => patch(row, c)} />
      ),
    },
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) => productOf(row)?.sellerName ?? '',
    },
    {
      id: 'packQty',
      label: 'В упаковке',
      align: 'right',
      render: (row) => productOf(row)?.packQty ?? '',
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
    {
      id: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <IconButton size="small" onClick={() => remove(row)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Докупить</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          disabled={!serviceId}
        >
          Добавить позицию
        </Button>
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
          <LinesTable blocks={view.blocks} columns={columns} resetKey={serviceId} />
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Новая позиция «Докупить»</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Наименование"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              required
            />
            <TextField
              label="Корпус/Footprint"
              value={draft.footprint}
              onChange={(event) => setDraft({ ...draft, footprint: event.target.value })}
            />
            <TextField
              label="Количество"
              type="number"
              value={draft.qty}
              onChange={(event) => setDraft({ ...draft, qty: event.target.value })}
            />
            <TextField
              label="Обозначение (необязательно)"
              value={draft.reference}
              onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={addLine}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
