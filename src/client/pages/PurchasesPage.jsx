import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import PurchaseBoardView from '../components/PurchaseBoardView.jsx';
import { api } from '../lib/apiClient.js';

/**
 * "Закупки": the purchase table of a single board, selected in the header.
 * Boards are managed (imported, renamed, deleted) on the "Платы" tab; the
 * service "Докупить" board has its own tab and is not listed here.
 */
export default function PurchasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const boardId = searchParams.get('board') || '';

  const [boards, setBoards] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [view, setView] = useState(null);
  const [count, setCount] = useState(1);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [boardList, sellerList] = await Promise.all([
          api.boards.list(),
          api.sellers.list(),
        ]);
        setBoards(boardList.filter((board) => !board.isService));
        setSellers(sellerList);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Fall back to the first board when none is selected.
  useEffect(() => {
    if (loaded && !boardId && boards.length > 0) {
      setSearchParams({ board: boards[0].id }, { replace: true });
    }
  }, [loaded, boardId, boards, setSearchParams]);

  const loadView = useCallback(async () => {
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
  }, [boardId]);

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

  async function saveCount() {
    try {
      await api.boards.update(boardId, { count: Number(count) });
      await loadView();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

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
        <TextField
          select
          size="small"
          label="Плата"
          value={boardId}
          onChange={(event) => setSearchParams({ board: event.target.value })}
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
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {view ? (
        <PurchaseBoardView
          board={view.board}
          blocks={view.blocks}
          totals={view.totals}
          sellers={sellers}
          onPatchLine={patchLine}
        />
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
