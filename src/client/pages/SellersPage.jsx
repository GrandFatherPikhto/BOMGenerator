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
  ListItemButton,
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
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../hooks/usePagination.js';
import { api } from '../lib/apiClient.js';
import { formatMoney } from '../format.js';

const EMPTY_SELLER = { name: '', url: '', description: '', shippingCost: 0 };
const EMPTY_PRODUCT = {
  name: '',
  url: '',
  packQty: 1,
  packPrice: 0,
  category: '',
  description: '',
  footprint: '',
};

/**
 * Master-detail "Продавцы": the left list holds the shops, the right side the
 * products (offers) of the selected shop. Products carry the package quantity
 * and price; the shop carries the (optional) URL, description and shipping.
 */
export default function SellersPage() {
  const [sellers, setSellers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  const [sellerDialog, setSellerDialog] = useState(false);
  const [sellerDraft, setSellerDraft] = useState(EMPTY_SELLER);
  const [productDialog, setProductDialog] = useState(false);
  const [productDraft, setProductDraft] = useState(EMPTY_PRODUCT);

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { page, pageSize, setPage, setPageSize, pageItems } = usePagination(products);

  const loadSellers = useCallback(async () => {
    try {
      const list = await api.sellers.list();
      setSellers(list);
      setSelectedId((current) =>
        list.some((seller) => seller._id === current) ? current : list[0]?._id ?? null,
      );
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (!selectedId) {
      setProducts([]);
      return;
    }
    try {
      setProducts(await api.sellers.products(selectedId));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [selectedId]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const selected = sellers.find((seller) => seller._id === selectedId) ?? null;

  function openSellerNew() {
    setSellerDraft(EMPTY_SELLER);
    setSellerDialog(true);
  }

  function openSellerEdit(seller) {
    setSellerDraft({ ...EMPTY_SELLER, ...seller });
    setSellerDialog(true);
  }

  async function saveSeller() {
    try {
      if (sellerDraft._id) {
        await api.sellers.update(sellerDraft._id, sellerDraft);
      } else {
        const created = await api.sellers.create(sellerDraft);
        setSelectedId(created._id);
      }
      setSellerDialog(false);
      await loadSellers();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function removeSeller(seller) {
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `Удалить продавца «${seller.name}» вместе с его товарами (${seller.productCount})?`,
      )
    ) {
      return;
    }
    try {
      await api.sellers.remove(seller._id);
      await loadSellers();
      await loadProducts();
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  function openProductNew() {
    setProductDraft(EMPTY_PRODUCT);
    setProductDialog(true);
  }

  function openProductEdit(product) {
    setProductDraft({ ...EMPTY_PRODUCT, ...product });
    setProductDialog(true);
  }

  async function saveProduct() {
    try {
      if (productDraft.id) {
        await api.products.update(productDraft.id, productDraft);
      } else {
        await api.sellers.addProduct(selectedId, productDraft);
      }
      setProductDialog(false);
      await Promise.all([loadProducts(), loadSellers()]);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function removeProduct(product) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Удалить товар «${product.name}»?`)) {
      return;
    }
    try {
      await api.products.remove(product.id);
      await Promise.all([loadProducts(), loadSellers()]);
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function handleImport({ file, sheet }) {
    const result = await api.sellers.import(file, sheet);
    setImportOpen(false);
    setImportResult(result);
    await loadSellers();
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={openSellerNew}>
            Добавить продавца
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
          severity={
            importResult.summary.added || importResult.summary.updated ? 'success' : 'info'
          }
          sx={{ mb: 2 }}
          onClose={() => setImportResult(null)}
        >
          Импорт: продавцов добавлено {importResult.summary.sellersCreated ?? 0}, обновлено{' '}
          {importResult.summary.sellersUpdated ?? 0}; товаров добавлено{' '}
          {importResult.summary.added}, обновлено {importResult.summary.updated}, без
          изменений {importResult.summary.unchanged}, пропущено{' '}
          {importResult.summary.skipped} из {importResult.summary.total}.
          {importResult.warnings?.length > 0 && (
            <List dense disablePadding sx={{ mt: 1 }}>
              {importResult.warnings.slice(0, 8).map((warning, index) => (
                <ListItemText
                  key={index}
                  primary={warning}
                  primaryTypographyProps={{ variant: 'caption' }}
                />
              ))}
              {importResult.warnings.length > 8 && (
                <ListItemText
                  primary={`… и ещё ${importResult.warnings.length - 8}`}
                  primaryTypographyProps={{ variant: 'caption' }}
                />
              )}
            </List>
          )}
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Paper variant="outlined" sx={{ width: 320, flexShrink: 0 }}>
          {sellers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Пока нет продавцов. Добавьте вручную или импортируйте таблицу.
            </Typography>
          ) : (
            <List dense disablePadding>
              {sellers.map((seller) => (
                <ListItemButton
                  key={seller._id}
                  selected={seller._id === selectedId}
                  onClick={() => setSelectedId(seller._id)}
                >
                  <ListItemText
                    primary={seller.name}
                    secondary={`Товаров: ${seller.productCount}`}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {!selected ? (
            <Alert severity="info">Выберите продавца слева, чтобы увидеть его товары.</Alert>
          ) : (
            <>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  spacing={2}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6">{selected.name}</Typography>
                    {selected.url && (
                      <Typography variant="body2">
                        <a href={selected.url} target="_blank" rel="noreferrer">
                          {selected.url}
                        </a>
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      Доставка: {formatMoney(selected.shippingCost)}
                    </Typography>
                    {selected.description && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selected.description}
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      startIcon={<EditIcon />}
                      onClick={() => openSellerEdit(selected)}
                    >
                      Изменить
                    </Button>
                    <Button
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => removeSeller(selected)}
                    >
                      Удалить
                    </Button>
                  </Stack>
                </Stack>
              </Paper>

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle1">
                  Товары ({products.length})
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={openProductNew}
                >
                  Добавить товар
                </Button>
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Название</TableCell>
                      <TableCell>Категория</TableCell>
                      <TableCell align="right">В упаковке</TableCell>
                      <TableCell align="right">Цена упаковки</TableCell>
                      <TableCell>URL</TableCell>
                      <TableCell>Footprint</TableCell>
                      <TableCell>Описание</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageItems.map((product) => (
                      <TableRow key={product.id} hover>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell align="right">{product.packQty}</TableCell>
                        <TableCell align="right">{formatMoney(product.packPrice)}</TableCell>
                        <TableCell>
                          {product.url ? (
                            <a href={product.url} target="_blank" rel="noreferrer">
                              ссылка
                            </a>
                          ) : (
                            ''
                          )}
                        </TableCell>
                        <TableCell>{product.footprint}</TableCell>
                        <TableCell>{product.description}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => openProductEdit(product)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => removeProduct(product)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <Typography variant="body2" color="text.secondary">
                            У этого продавца пока нет товаров.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Pagination
                count={products.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </Box>
      </Stack>

      <ImportSellersDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
      />

      <Dialog
        open={sellerDialog}
        onClose={() => setSellerDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{sellerDraft._id ? 'Продавец' : 'Новый продавец'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={sellerDraft.name}
              onChange={(event) =>
                setSellerDraft({ ...sellerDraft, name: event.target.value })
              }
              required
            />
            <TextField
              label="URL (может быть пустым)"
              value={sellerDraft.url}
              onChange={(event) =>
                setSellerDraft({ ...sellerDraft, url: event.target.value })
              }
            />
            <TextField
              label="Доставка"
              type="number"
              value={sellerDraft.shippingCost}
              onChange={(event) =>
                setSellerDraft({ ...sellerDraft, shippingCost: event.target.value })
              }
            />
            <TextField
              label="Описание"
              value={sellerDraft.description}
              onChange={(event) =>
                setSellerDraft({ ...sellerDraft, description: event.target.value })
              }
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSellerDialog(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveSeller}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={productDialog}
        onClose={() => setProductDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{productDraft.id ? 'Товар' : 'Новый товар'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={productDraft.name}
              onChange={(event) =>
                setProductDraft({ ...productDraft, name: event.target.value })
              }
              required
            />
            <TextField
              label="URL (может быть пустым)"
              value={productDraft.url}
              onChange={(event) =>
                setProductDraft({ ...productDraft, url: event.target.value })
              }
            />
            <TextField
              label="Кол-во в упаковке"
              type="number"
              value={productDraft.packQty}
              onChange={(event) =>
                setProductDraft({ ...productDraft, packQty: event.target.value })
              }
            />
            <TextField
              label="Цена за упаковку"
              type="number"
              value={productDraft.packPrice}
              onChange={(event) =>
                setProductDraft({ ...productDraft, packPrice: event.target.value })
              }
            />
            <TextField
              label="Категория (справочно)"
              value={productDraft.category}
              onChange={(event) =>
                setProductDraft({ ...productDraft, category: event.target.value })
              }
            />
            <TextField
              label="Footprint (справочно, допускается маска)"
              value={productDraft.footprint}
              onChange={(event) =>
                setProductDraft({ ...productDraft, footprint: event.target.value })
              }
            />
            <TextField
              label="Описание"
              value={productDraft.description}
              onChange={(event) =>
                setProductDraft({ ...productDraft, description: event.target.value })
              }
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductDialog(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveProduct}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
