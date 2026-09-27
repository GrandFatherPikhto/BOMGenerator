import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import ImportDialog from '../components/ImportDialog.jsx';
import PurchaseBoardView from '../components/PurchaseBoardView.jsx';
import { api } from '../lib/apiClient.js';

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

  async function patchLine(lineId, changes) {
    try {
      await api.boards.updateLine(id, lineId, changes);
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

      <PurchaseBoardView
        board={board}
        blocks={view.blocks}
        totals={view.totals}
        sellers={sellers}
        onPatchLine={patchLine}
      />

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
