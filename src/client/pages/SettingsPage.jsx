import { useEffect, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { useSettings } from '../SettingsContext.jsx';
import { api } from '../lib/apiClient.js';

const PAGE_WIDTH_OPTIONS = [
  { value: 'normal', label: 'Обычная (1536)' },
  { value: 'wide', label: 'Широкая (1920)' },
  { value: 'full', label: 'Во всю ширину (100%)' },
];

export default function SettingsPage() {
  const { settings: shared, setSettings: setShared, reload } = useSettings();
  const [draft, setDraft] = useState(shared);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (shared) {
      setDraft(shared);
    }
  }, [shared]);

  async function save() {
    try {
      const updated = await api.settings.update(draft);
      setShared(updated);
      setDraft(updated);
      setNotice('Настройки сохранены');
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  if (!draft) {
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <Typography>Загрузка…</Typography>
    );
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Настройки
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Категория по умолчанию"
            value={draft.defaultCategoryName}
            onChange={(event) =>
              setDraft({ ...draft, defaultCategoryName: event.target.value })
            }
          />
          <TextField
            select
            label="Сортировка по умолчанию"
            value={draft.defaultSort}
            onChange={(event) => setDraft({ ...draft, defaultSort: event.target.value })}
          >
            <MenuItem value="name">по алфавиту</MenuItem>
            <MenuItem value="value_desc">по убыванию номинала</MenuItem>
            <MenuItem value="value_asc">по возрастанию номинала</MenuItem>
          </TextField>
          <TextField
            select
            label="Ширина страницы"
            value={draft.pageWidth ?? 'normal'}
            onChange={(event) => setDraft({ ...draft, pageWidth: event.target.value })}
            helperText="Применяется ко всем страницам сразу после сохранения"
          >
            {PAGE_WIDTH_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Подпись «без подкатегории»"
            value={draft.subcategoryOtherLabel}
            onChange={(event) =>
              setDraft({ ...draft, subcategoryOtherLabel: event.target.value })
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.excludeDnpByDefault}
                onChange={(event) =>
                  setDraft({ ...draft, excludeDnpByDefault: event.target.checked })
                }
              />
            }
            label="Исключать строки DNP по умолчанию"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.excludeFromBomByDefault}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    excludeFromBomByDefault: event.target.checked,
                  })
                }
              />
            }
            label="Исключать «Exclude from BOM» по умолчанию"
          />
          <Box>
            <Button variant="contained" onClick={save}>
              Сохранить
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
