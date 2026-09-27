import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

/**
 * Import dialog: pick or drop a CSV file, edit the board name and (optionally)
 * override the DNP / Exclude-from-BOM exclusions.
 */
export default function ImportDialog({ open, onClose, onSubmit, defaultName = '' }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState(defaultName);
  const [excludeDnp, setExcludeDnp] = useState(true);
  const [excludeFromBom, setExcludeFromBom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setName(defaultName);
      setError(null);
      setBusy(false);
    }
  }, [open, defaultName]);

  function choose(selected) {
    if (!selected) {
      return;
    }
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('Ожидается файл .csv');
      return;
    }
    setError(null);
    setFile(selected);
    if (!name) {
      setName(selected.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function submit() {
    if (!file) {
      setError('Выберите CSV-файл');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ file, name, excludeDnp, excludeFromBom });
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Импорт BOM-файла KiCad</DialogTitle>
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
              {file ? file.name : 'Перетащите CSV-файл сюда или нажмите для выбора'}
            </Typography>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </Box>

          <TextField
            label="Имя платы"
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText="По умолчанию — имя файла без расширения. Повторный импорт того же файла обновит эту плату."
            fullWidth
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={excludeDnp}
                onChange={(event) => setExcludeDnp(event.target.checked)}
              />
            }
            label="Исключать строки DNP"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={excludeFromBom}
                onChange={(event) => setExcludeFromBom(event.target.checked)}
              />
            }
            label="Исключать «Exclude from BOM»"
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={submit} variant="contained" disabled={busy}>
          Импортировать
        </Button>
      </DialogActions>
    </Dialog>
  );
}
