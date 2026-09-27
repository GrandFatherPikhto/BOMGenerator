import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { api } from '../lib/apiClient.js';
import ImportDialog from '../components/ImportDialog.jsx';
import { formatDate } from '../format.js';

export default function BoardsPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoards(await api.boards.list());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleImport({ file, name, excludeDnp, excludeFromBom }) {
    const result = await api.boards.import(file, name, { excludeDnp, excludeFromBom });
    setImportOpen(false);
    setNotice(
      `Импорт «${result.board.name}»: добавлено ${result.summary.added}, ` +
        `обновлено ${result.summary.updated}, удалено ${result.summary.removed}`,
    );
    await load();
  }

  async function handleCreate() {
    // eslint-disable-next-line no-alert
    const name = window.prompt('Имя новой пустой платы');
    if (!name) {
      return;
    }
    const board = await api.boards.create({ name });
    await load();
    navigate(`/boards/${board.id}`);
  }

  async function handleDelete(board) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Удалить плату «${board.name}» вместе со строками?`)) {
      return;
    }
    await api.boards.remove(board.id);
    await load();
  }

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Платы</Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<AddIcon />} onClick={handleCreate}>
            Новая плата
          </Button>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
          >
            Импортировать CSV
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Плата</TableCell>
              <TableCell>Файл</TableCell>
              <TableCell align="right">Плат в изделии</TableCell>
              <TableCell align="right">Позиций</TableCell>
              <TableCell>Импортирована</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {boards.map((board) => (
              <TableRow key={board.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{board.name}</span>
                    {board.isService && <Chip size="small" label="служебная" />}
                  </Stack>
                </TableCell>
                <TableCell>{board.sourceFile || '—'}</TableCell>
                <TableCell align="right">{board.count}</TableCell>
                <TableCell align="right">{board.lineCount}</TableCell>
                <TableCell>{formatDate(board.importedAt)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => navigate(`/boards/${board.id}`)}>
                    Открыть
                  </Button>
                  {!board.isService && (
                    <IconButton size="small" onClick={() => handleDelete(board)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
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
