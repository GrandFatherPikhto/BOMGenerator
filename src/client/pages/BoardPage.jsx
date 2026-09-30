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

import BomBoardView from '../components/BomBoardView.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import { useUiState } from '../hooks/useUiState.js';
import { api } from '../lib/apiClient.js';

/** Defaults of the "boards" UI-state section. Module-level for a stable memo. */
const BOARDS_UI_DEFAULTS = { lastOpenBoardId: '' };

/**
 * Read-only BOM of one board (opened from the "Платы" list). Purchase data and
 * editing live on the "Закупки" tab. Opening a board remembers it so the
 * "Платы" tab returns here.
 */
export default function BoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [, updateUi] = useUiState('boards', BOARDS_UI_DEFAULTS);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const viewData = await api.boards.view(id);
      setView(viewData);
      setName(viewData.board.name);
      setCount(viewData.board.count);
    } catch (loadError) {
      if (loadError.status === 404) {
        // The remembered board no longer exists (deleted, or the database was
        // reset): forget it and fall back to the board list instead of
        // dead-ending on "Board not found".
        updateUi({ lastOpenBoardId: '' });
        navigate('/', { replace: true });
        return;
      }
      setError(loadError.message);
    }
  }, [id, navigate, updateUi]);

  useEffect(() => {
    load();
  }, [load]);

  // Remember the board that was opened last.
  useEffect(() => {
    if (id) {
      updateUi({ lastOpenBoardId: id });
    }
  }, [id, updateUi]);

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
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          К списку
        </Button>
        <TextField
          size="small"
          label="Имя платы"
          value={name}
          onChange={(event) => setName(event.target.value)}
          sx={{ minWidth: 240 }}
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

      <BomBoardView board={board} blocks={view.blocks} />

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
