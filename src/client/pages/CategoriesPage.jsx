import { useCallback, useEffect, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { api } from '../lib/apiClient.js';

const EMPTY = {
  order: 0,
  name: '',
  refMode: 'prefix',
  refPatterns: [],
  nameMode: 'prefix',
  namePatterns: [],
  footprintMode: 'prefix',
  footprintPatterns: [],
  caseSensitive: false,
  sort: 'name',
  subcategories: [],
};

const SORTS = [
  { value: 'name', label: 'по алфавиту' },
  { value: 'value_desc', label: 'по убыванию номинала' },
  { value: 'value_asc', label: 'по возрастанию номинала' },
];

function regexError(pattern) {
  if (!pattern) {
    return null;
  }
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return null;
  } catch (error) {
    return error.message;
  }
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const { page, pageSize, setPage, setPageSize, pageItems } = usePagination(categories);

  const load = useCallback(async () => {
    try {
      setCategories(await api.categories.list());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setDraft({ ...EMPTY, order: categories.length });
    setOpen(true);
  }

  function openEdit(category) {
    setDraft({
      ...EMPTY,
      ...category,
      refPatterns: category.refPatterns ?? [],
      namePatterns: category.namePatterns ?? [],
      footprintPatterns: category.footprintPatterns ?? [],
      subcategories: category.subcategories ?? [],
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = { ...draft, order: Number(draft.order) };
      if (draft._id) {
        await api.categories.update(draft._id, payload);
      } else {
        await api.categories.create(payload);
      }
      setOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function remove(category) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) {
      return;
    }
    await api.categories.remove(category._id);
    await load();
  }

  function patternError(patterns, mode) {
    if (mode !== 'regex') {
      return null;
    }
    for (const pattern of patterns) {
      const message = regexError(pattern);
      if (message) {
        return `«${pattern}»: ${message}`;
      }
    }
    return null;
  }

  const refError = patternError(draft.refPatterns, draft.refMode);
  const nameError = patternError(draft.namePatterns, draft.nameMode);
  const footprintError = patternError(draft.footprintPatterns, draft.footprintMode);
  const patternMissing =
    (draft.refPatterns?.length ?? 0) === 0 &&
    (draft.namePatterns?.length ?? 0) === 0 &&
    (draft.footprintPatterns?.length ?? 0) === 0;
  const patternProblem = Boolean(refError || nameError || footprintError || patternMissing);

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Категории разбора</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
          Добавить
        </Button>
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
              <TableCell align="right">Порядок</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Footprint</TableCell>
              <TableCell>Сортировка</TableCell>
              <TableCell>Подкатегории</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {pageItems.map((category) => (
              <TableRow key={category._id} hover>
                <TableCell align="right">{category.order}</TableCell>
                <TableCell>{category.name}</TableCell>
                <TableCell>
                  {category.refPatterns?.length
                    ? `${category.refMode}: ${category.refPatterns.join(', ')}`
                    : '—'}
                </TableCell>
                <TableCell>
                  {category.namePatterns?.length
                    ? `${category.nameMode}: ${category.namePatterns.join(', ')}`
                    : '—'}
                </TableCell>
                <TableCell>
                  {category.footprintPatterns?.length
                    ? `${category.footprintMode}: ${category.footprintPatterns.join(', ')}`
                    : '—'}
                </TableCell>
                <TableCell>{category.sort || '(по умолчанию)'}</TableCell>
                <TableCell>
                  {(category.subcategories ?? [])
                    .map((sub) => sub.name)
                    .join(', ') || '—'}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(category)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => remove(category)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Pagination
        count={categories.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{draft._id ? 'Категория' : 'Новая категория'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Порядок"
                type="number"
                value={draft.order}
                onChange={(event) => setDraft({ ...draft, order: event.target.value })}
                sx={{ width: 140 }}
              />
              <TextField
                label="Название"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                sx={{ flexGrow: 1 }}
                required
              />
              <TextField
                select
                label="Сортировка"
                value={draft.sort || 'name'}
                onChange={(event) => setDraft({ ...draft, sort: event.target.value })}
                sx={{ width: 240 }}
              >
                {SORTS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Режим Reference"
                value={draft.refMode}
                onChange={(event) => setDraft({ ...draft, refMode: event.target.value })}
                sx={{ width: 200 }}
              >
                <MenuItem value="prefix">prefix</MenuItem>
                <MenuItem value="regex">regex</MenuItem>
              </TextField>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={draft.refPatterns ?? []}
                onChange={(event, value) => setDraft({ ...draft, refPatterns: value })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Паттерны Reference"
                    error={Boolean(refError)}
                    helperText={
                      refError ||
                      (draft.refMode === 'regex'
                        ? 'Regex по отдельным обозначениям (Enter — добавить)'
                        : 'Точные буквенные префиксы (Enter — добавить)')
                    }
                  />
                )}
                sx={{ flexGrow: 1 }}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Режим Value"
                value={draft.nameMode}
                onChange={(event) => setDraft({ ...draft, nameMode: event.target.value })}
                sx={{ width: 200 }}
              >
                <MenuItem value="prefix">prefix</MenuItem>
                <MenuItem value="regex">regex</MenuItem>
              </TextField>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={draft.namePatterns ?? []}
                onChange={(event, value) => setDraft({ ...draft, namePatterns: value })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Паттерны Value"
                    error={Boolean(nameError)}
                    helperText={
                      nameError ||
                      (draft.nameMode === 'regex'
                        ? 'Regex по всей строке Value (Enter — добавить)'
                        : 'Префиксы начала Value (Enter — добавить)')
                    }
                  />
                )}
                sx={{ flexGrow: 1 }}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Режим Footprint"
                value={draft.footprintMode}
                onChange={(event) =>
                  setDraft({ ...draft, footprintMode: event.target.value })
                }
                sx={{ width: 200 }}
              >
                <MenuItem value="prefix">prefix</MenuItem>
                <MenuItem value="contains">contains</MenuItem>
                <MenuItem value="regex">regex</MenuItem>
              </TextField>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={draft.footprintPatterns ?? []}
                onChange={(event, value) =>
                  setDraft({ ...draft, footprintPatterns: value })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Паттерны Footprint"
                    error={Boolean(footprintError)}
                    helperText={
                      footprintError ||
                      (draft.footprintMode === 'prefix'
                        ? 'Начало строки Footprint (Enter — добавить)'
                        : draft.footprintMode === 'contains'
                          ? 'Подстрока в Footprint (Enter — добавить)'
                          : 'Regex по всей строке Footprint (Enter — добавить)')
                    }
                  />
                )}
                sx={{ flexGrow: 1 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(draft.caseSensitive)}
                  onChange={(event) =>
                    setDraft({ ...draft, caseSensitive: event.target.checked })
                  }
                />
              }
              label="Учитывать регистр в условиях"
            />

            {patternMissing && (
              <Alert severity="warning">
                Нужен хотя бы один паттерн Reference, Value или Footprint.
              </Alert>
            )}

            <Typography variant="subtitle2">Подкатегории</Typography>
            {(draft.subcategories ?? []).map((sub, index) => (
              <Stack direction="row" spacing={1} key={`sub-${index}`}>
                <TextField
                  label="Название"
                  value={sub.name}
                  onChange={(event) => {
                    const next = [...draft.subcategories];
                    next[index] = { ...next[index], name: event.target.value };
                    setDraft({ ...draft, subcategories: next });
                  }}
                  sx={{ flexGrow: 1 }}
                />
                <TextField
                  label="footprint содержит"
                  value={sub.footprintContains}
                  onChange={(event) => {
                    const next = [...draft.subcategories];
                    next[index] = { ...next[index], footprintContains: event.target.value };
                    setDraft({ ...draft, subcategories: next });
                  }}
                  sx={{ flexGrow: 1 }}
                />
                <IconButton
                  onClick={() =>
                    setDraft({
                      ...draft,
                      subcategories: draft.subcategories.filter((_, i) => i !== index),
                    })
                  }
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setDraft({
                    ...draft,
                    subcategories: [
                      ...(draft.subcategories ?? []),
                      { name: '', footprintContains: '' },
                    ],
                  })
                }
              >
                Добавить подкатегорию
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={save} disabled={patternProblem}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
