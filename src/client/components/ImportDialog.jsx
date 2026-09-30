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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

/**
 * Import dialog: pick or drop a CSV file, choose the target board and
 * (optionally) override the DNP / Exclude-from-BOM exclusions.
 *
 * A board remembers the file name it was imported from (`sourceFile`). When an
 * existing board is chosen as the target and the uploaded file is named
 * differently, the import is blocked with a red warning until the user confirms
 * — the new name is then remembered for the following imports. Without an
 * explicit target a renamed file would silently create a duplicate board.
 */
export default function ImportDialog({
  open,
  onClose,
  onSubmit,
  defaultName = '',
  boards = [],
}) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState(defaultName);
  const [targetBoardId, setTargetBoardId] = useState('');
  const [renameConfirmed, setRenameConfirmed] = useState(false);
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
      setTargetBoardId('');
      setRenameConfirmed(false);
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
    setRenameConfirmed(false);
    setFile(selected);
    if (!name) {
      setName(selected.name.replace(/\.[^.]+$/, ''));
    }
  }

  // The service "Докупить" board is never a CSV target.
  const reimportableBoards = boards.filter((board) => !board.isService);
  const targetBoard =
    reimportableBoards.find((board) => board.id === targetBoardId) ?? null;
  const incomingName = file?.name ?? '';
  const storedFileName = targetBoard?.sourceFile ?? '';

  // A chosen board remembers a different file name: looks like the wrong file.
  const nameMismatch = Boolean(
    targetBoard && file && storedFileName && storedFileName !== incomingName,
  );
  // The name is already owned by another board — the import would update it.
  const ownedByOther =
    file && incomingName
      ? (reimportableBoards.find(
          (board) =>
            board.id !== targetBoardId &&
            board.sourceFile &&
            board.sourceFile === incomingName,
        ) ?? null)
      : null;
  const blocked = nameMismatch && !renameConfirmed;

  async function submit() {
    if (!file) {
      setError('Выберите CSV-файл');
      return;
    }
    if (blocked) {
      setError('Подтвердите запоминание нового имени файла.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        file,
        // The name is only edited when a new board is created.
        name: targetBoard ? '' : name,
        excludeDnp,
        excludeFromBom,
        targetBoardId: targetBoard ? targetBoard.id : undefined,
        renameSourceFile: nameMismatch ? renameConfirmed : undefined,
      });
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
            select
            label="Куда импортировать"
            value={targetBoardId}
            onChange={(event) => {
              setTargetBoardId(event.target.value);
              setRenameConfirmed(false);
            }}
            helperText="«Создать новую плату» — для нового изделия. Выберите плату, чтобы обновить её."
            fullWidth
          >
            <MenuItem value="">Создать новую плату</MenuItem>
            {reimportableBoards.map((board) => (
              <MenuItem key={board.id} value={board.id}>
                {board.name}
              </MenuItem>
            ))}
          </TextField>

          {targetBoard ? (
            <Typography variant="body2" color="text.secondary">
              Сохранённое имя файла: {storedFileName || '— (будет записано текущее)'}
            </Typography>
          ) : (
            <TextField
              label="Имя платы"
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText="По умолчанию — имя файла без расширения. Повторный импорт того же файла обновит эту плату."
              fullWidth
            />
          )}

          {nameMismatch && (
            <>
              <Alert severity="error">
                Имя файла «{incomingName}» не совпадает с сохранённым «{storedFileName}»
                для платы «{targetBoard.name}». Похоже, выбран не тот файл. Если это всё
                же повторный импорт — подтвердите, и новое имя сохранится для следующих
                проверок.
              </Alert>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={renameConfirmed}
                    onChange={(event) => setRenameConfirmed(event.target.checked)}
                  />
                }
                label="Запомнить новое имя файла и обновить эту плату"
              />
            </>
          )}

          {!nameMismatch && ownedByOther && (
            <Alert severity="warning">
              Файл «{incomingName}» уже импортирован в плату «{ownedByOther.name}» —
              импорт обновит её, а не создаст новую.
            </Alert>
          )}

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
        <Button onClick={submit} variant="contained" disabled={busy || blocked}>
          Импортировать
        </Button>
      </DialogActions>
    </Dialog>
  );
}
