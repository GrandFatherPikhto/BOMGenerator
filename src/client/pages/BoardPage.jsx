import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { api } from '../api.js';
import ImportDialog from '../components/ImportDialog.jsx';
import {
  CommonCell,
  LinesTable,
  SellerCell,
  ShippingCell,
} from '../components/LinesTable.jsx';
import { formatMoney } from '../format.js';

export default function BoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [viewData, sellerList] = await Promise.all([
        api.boards.view(id),
        api.sellers.list(),
      ]);
      setView(viewData);
      setSellers(sellerList);
      setName(viewData.board.name);
      setCount(viewData.board.count);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(line, changes) {
    try {
      await api.boards.updateLine(id, line.id, changes);
      await load();
    } catch (patchError) {
      setError(patchError.message);
    }
  }

  async function saveBoard() {
    try {
      await api.boards.update(id, { name, count: Number(count) });
      await load();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleImport(payload) {
    const result = await api.boards.import(payload.file, payload.name, payload);
    setImportOpen(false);
    setNotice(
      `Импорт: добавлено ${result.summary.added}, обновлено ${result.summary.updated}, удалено ${result.summary.removed}`,
    );
    await load();
  }

  if (!view) {
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const board = view.board;
  const sellerMap = new Map(sellers.map((seller) => [seller._id, seller]));
  const sellerOf = (row) => (row.sellerId ? sellerMap.get(row.sellerId) : null);

  const columns = [
    { id: 'reference', label: 'Обозначение', sx: { whiteSpace: 'nowrap' } },
    { id: 'value', label: 'Наименование' },
    { id: 'footprint', label: 'Корпус/Footprint' },
    { id: 'qty', label: 'Штук на плату', align: 'right' },
    { id: 'boardCount', label: 'Плат', align: 'right', render: () => board.count },
    {
      id: 'totalQty',
      label: 'Итого',
      align: 'right',
      sx: { fontWeight: 'bold' },
      render: (row) => row.totalQty,
    },
    {
      id: 'common',
      label: 'Общие',
      render: (row) => <CommonCell row={row} onChange={(c) => patch(row, c)} />,
    },
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
    {
      id: 'packPrice',
      label: 'Цена упаковки',
      align: 'right',
      render: (row) => formatMoney(sellerOf(row)?.packPrice),
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
  ];

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          К списку
        </Button>
        <TextField
          size="small"
          label="Имя платы"
          value={name}
          onChange={(event) => setName(event.target.value)}
          sx={{ minWidth: 260 }}
        />
        <TextField
          size="small"
          type="number"
          label="Плат в изделии"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          sx={{ width: 150 }}
        />
        <Button variant="outlined" onClick={saveBoard}>
          Сохранить
        </Button>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => setImportOpen(true)}
        >
          Реимпорт
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        {board.sourceFile && (
          <Typography variant="body2" color="text.secondary">
            Файл: {board.sourceFile}
          </Typography>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

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
        <Typography variant="caption" color="text.secondary">
          Позиции с галочкой «Общие» не входят в «Итого» — они считаются на листе
          «Общие закупки».
        </Typography>
      </Paper>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
        defaultName={board.name}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </Box>
  );
}
