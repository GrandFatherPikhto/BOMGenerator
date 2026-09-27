import { useCallback, useEffect, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
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

import ImportSellersDialog from '../components/ImportSellersDialog.jsx';
import { api } from '../lib/apiClient.js';

const EMPTY = {
  name: '',
  category: '',
  footprint: '',
  url: '',
  packQty: 1,
  packPrice: 0,
  shippingCost: 0,
  description: '',
};

export default function SellersPage() {
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setSellers(await api.sellers.list());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY);
    setOpen(true);
  }

  function openEdit(seller) {
    setDraft({ ...EMPTY, ...seller });
    setOpen(true);
  }

  async function save() {
    try {
      if (draft._id) {
        await api.sellers.update(draft._id, draft);
      } else {
        await api.sellers.create(draft);
      }
      setOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function remove(seller) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Удалить продавца «${seller.name}»?`)) {
      return;
    }
    await api.sellers.remove(seller._id);
    await load();
  }

  async function handleImport({ file, sheet }) {
    const result = await api.sellers.import(file, sheet);
    setImportOpen(false);
    setImportResult(result);
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
        <Typography variant="h5">Продавцы</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
          >
            Импортировать
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
            Добавить
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {importResult && (
        <Alert
          severity={importResult.summary.added || importResult.summary.updated ? 'success' : 'info'}
          sx={{ mb: 2 }}
          onClose={() => setImportResult(null)}
        >
          Импорт: добавлено {importResult.summary.added}, обновлено{' '}
          {importResult.summary.updated}, без изменений {importResult.summary.unchanged},
          пропущено {importResult.summary.skipped} из {importResult.summary.total}.
          {importResult.warnings?.length > 0 && (
            <List dense disablePadding sx={{ mt: 1 }}>
              {importResult.warnings.slice(0, 8).map((warning, index) => (
                <ListItem key={index} disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary={warning}
                    primaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
              {importResult.warnings.length > 8 && (
                <ListItem disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary={`… и ещё ${importResult.warnings.length - 8}`}
                    primaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              )}
            </List>
          )}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell align="right">В упаковке</TableCell>
              <TableCell align="right">Цена упаковки</TableCell>
              <TableCell>URL</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {sellers.map((seller) => (
              <TableRow key={seller._id} hover>
                <TableCell>{seller.name}</TableCell>
                <TableCell>{seller.category}</TableCell>
                <TableCell align="right">{seller.packQty}</TableCell>
                <TableCell align="right">{seller.packPrice}</TableCell>
                <TableCell>
                  {seller.url ? (
                    <a href={seller.url} target="_blank" rel="noreferrer">
                      ссылка
                    </a>
                  ) : (
                    ''
                  )}
                </TableCell>
                <TableCell>{seller.description}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(seller)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => remove(seller)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ImportSellersDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{draft._id ? 'Продавец' : 'Новый продавец'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
            <TextField
              label="Категория (справочно)"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            <TextField
              label="Footprint (справочно, допускается маска)"
              value={draft.footprint}
              onChange={(event) => setDraft({ ...draft, footprint: event.target.value })}
            />
            <TextField
              label="URL"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
            <TextField
              label="Кол-во в упаковке"
              type="number"
              value={draft.packQty}
              onChange={(event) => setDraft({ ...draft, packQty: event.target.value })}
            />
            <TextField
              label="Цена за упаковку"
              type="number"
              value={draft.packPrice}
              onChange={(event) => setDraft({ ...draft, packPrice: event.target.value })}
            />
            <TextField
              label="Доставка (справочно)"
              type="number"
              value={draft.shippingCost}
              onChange={(event) =>
                setDraft({ ...draft, shippingCost: event.target.value })
              }
            />
            <TextField
              label="Описание"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={save}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
