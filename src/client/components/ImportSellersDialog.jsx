import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { api } from '../lib/apiClient.js';

const XLSX_RE = /\.(xlsx|xlsm)$/i;

/**
 * Import sellers and their products from CSV or Excel.
 *
 * Two layouts are accepted: the two-level one (seller + product on the same
 * row) and the legacy one-level one (a row per shop item, which becomes a
 * seller plus a product with the same name and URL). A product is matched by
 * URL, otherwise by name within its seller; only the name and URL are updated.
 * For an Excel file the user picks the sheet.
 */
export default function ImportSellersDialog({ open, onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setSheets([]);
      setSheet('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function choose(selected) {
    if (!selected) {
      return;
    }
    const isCsv = /\.csv$/i.test(selected.name);
    const isXlsx = XLSX_RE.test(selected.name);
    if (!isCsv && !isXlsx) {
      setError('Ожидается файл .csv, .xlsx или .xlsm');
      return;
    }
    setError(null);
    setFile(selected);
    setSheets([]);
    setSheet('');

    if (isXlsx) {
      setLoadingSheets(true);
      try {
        const result = await api.sellers.importSheets(selected);
        setSheets(result.sheets ?? []);
        setSheet(result.sheets?.[0] ?? '');
      } catch (sheetError) {
        setError(sheetError.message);
      } finally {
        setLoadingSheets(false);
      }
    }
  }

  async function submit() {
    if (!file) {
      setError('Выберите файл');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ file, sheet: sheet || undefined });
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Импорт продавцов</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              choose(event.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: dragging ? 'primary.main' : 'grey.400',
              borderRadius: 1,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: dragging ? 'action.hover' : 'transparent',
            }}
          >
            <Typography variant="body1">
              {file ? file.name : 'Перетащите CSV/XLSX сюда или нажмите для выбора'}
            </Typography>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xlsm"
              hidden
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </Box>

          {loadingSheets && <Typography variant="body2">Чтение листов…</Typography>}

          {sheets.length > 0 && (
            <TextField
              select
              label="Лист"
              value={sheet}
              onChange={(event) => setSheet(event.target.value)}
              helperText="Выберите лист книги Excel"
            >
              {sheets.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Alert severity="info">
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              Ожидаемые колонки (по названию, порядок не важен)
            </Typography>
            <Typography variant="body2" component="div">
              1. Новый формат: <em>Продавец</em>, <em>URL продавца</em>,{' '}
              <em>Товар</em>, <em>URL товара</em>, <em>Кол-во в упаковке</em>,{' '}
              <em>Цена за упаковку</em>, <em>Категория</em>, <em>Описание</em>.
            </Typography>
            <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
              2. Старый формат: <em>Название</em>, <em>Категория</em>, <em>URL</em>,{' '}
              <em>Кол-во в упаковке</em>, <em>Цена за упаковку</em>,{' '}
              <em>Доставка</em>, <em>Описание</em> — каждая строка заводит продавца
              и товар с одинаковыми названием и URL.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Товар находится по URL, иначе по названию внутри продавца;
              обновляются только название и URL, упаковка и цена не затрагиваются.
            </Typography>
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={submit} variant="contained" disabled={busy || !file}>
          Импортировать
        </Button>
      </DialogActions>
    </Dialog>
  );
}
