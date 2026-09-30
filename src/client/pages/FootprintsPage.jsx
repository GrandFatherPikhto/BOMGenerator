import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import ClearableTextField from '../components/ClearableTextField.jsx';
import { PAGE_SIZE_DEFAULT } from '../components/LinesTable.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { useUiState } from '../hooks/useUiState.js';
import { api } from '../lib/apiClient.js';

/**
 * Defaults of the "footprints" UI-state section. Module-level on purpose: it is
 * a dependency of the `useUiState` memo.
 */
const FOOTPRINTS_UI_DEFAULTS = { filter: '', page: 0, size: PAGE_SIZE_DEFAULT };

/**
 * "Посадочные места": every footprint used by the enabled boards with a
 * checkbox that turns footprint-only grouping on. A marked footprint collapses
 * the positions that share it into one row on "Закупки → Все" and "Общие
 * закупки", ignoring the value/name.
 */
export default function FootprintsPage() {
  const [ui, updateUi] = useUiState('footprints', FOOTPRINTS_UI_DEFAULTS);
  const [footprints, setFootprints] = useState([]);
  const [filter, setFilter] = useState(ui.filter);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.footprints.list();
      setFootprints(data.footprints ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return footprints;
    }
    return footprints.filter((item) =>
      String(item.footprint ?? '')
        .toLowerCase()
        .includes(needle),
    );
  }, [footprints, filter]);

  const { page, pageSize, setPage, setPageSize, pageItems } = usePagination(filtered, {
    initialPage: ui.page,
    initialPageSize: ui.size || PAGE_SIZE_DEFAULT,
    resetKey: filter,
  });

  // Persist the working context so a switch to another tab does not reset it.
  useEffect(() => {
    updateUi({ filter });
  }, [filter, updateUi]);

  useEffect(() => {
    updateUi({ page, size: pageSize });
  }, [page, pageSize, updateUi]);

  async function toggle(item, grouped) {
    try {
      await api.footprints.setGrouped(item.footprint, grouped);
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Посадочные места
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        Отметьте посадочные места, позиции которых нужно суммировать по footprint
        (без имени) в «Закупки → Все» и «Общие закупки». Имена позиций видны в
        раскрытии строки.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
        <ClearableTextField
          size="small"
          label="Поиск по посадочному месту"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          sx={{ minWidth: 300 }}
        />
      </Stack>

      {!loaded ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Посадочное место</TableCell>
                  <TableCell align="right">Позиций</TableCell>
                  <TableCell align="right">Плат</TableCell>
                  <TableCell align="right">Итого</TableCell>
                  <TableCell align="center">
                    Группировать по посадочному месту
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageItems.map((item) => (
                  <TableRow key={item.footprint} hover>
                    <TableCell>{item.footprint}</TableCell>
                    <TableCell align="right">{item.positions}</TableCell>
                    <TableCell align="right">{item.boards}</TableCell>
                    <TableCell align="right">{item.totalQty}</TableCell>
                    <TableCell align="center" padding="checkbox">
                      <Checkbox
                        checked={Boolean(item.grouped)}
                        onChange={(event) => toggle(item, event.target.checked)}
                        inputProps={{
                          'aria-label': `Группировать по посадочному месту: ${item.footprint}`,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Pagination
            count={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </Box>
  );
}
