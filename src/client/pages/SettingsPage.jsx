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

import { api } from '../lib/apiClient.js';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.settings
      .get()
      .then(setSettings)
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function save() {
    try {
      const updated = await api.settings.update(settings);
      setSettings(updated);
      setNotice('Настройки сохранены');
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  if (!settings) {
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
            value={settings.defaultCategoryName}
            onChange={(event) =>
              setSettings({ ...settings, defaultCategoryName: event.target.value })
            }
          />
          <TextField
            select
            label="Сортировка по умолчанию"
            value={settings.defaultSort}
            onChange={(event) =>
              setSettings({ ...settings, defaultSort: event.target.value })
            }
          >
            <MenuItem value="name">по алфавиту</MenuItem>
            <MenuItem value="value_desc">по убыванию номинала</MenuItem>
            <MenuItem value="value_asc">по возрастанию номинала</MenuItem>
          </TextField>
          <TextField
            label="Подпись «без подкатегории»"
            value={settings.subcategoryOtherLabel}
            onChange={(event) =>
              setSettings({ ...settings, subcategoryOtherLabel: event.target.value })
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.excludeDnpByDefault}
                onChange={(event) =>
                  setSettings({ ...settings, excludeDnpByDefault: event.target.checked })
                }
              />
            }
            label="Исключать строки DNP по умолчанию"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.excludeFromBomByDefault}
                onChange={(event) =>
                  setSettings({
                    ...settings,
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
