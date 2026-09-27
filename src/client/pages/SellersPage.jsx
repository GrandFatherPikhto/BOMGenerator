import { useCallback, useEffect, useMemo, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
import { compileProductFilter, scopeProducts } from '../../shared/index.js';

const EMPTY_SELLER = { name: '', url: '', description: '' };
const EMPTY_PRODUCT = {
  name: '',
  url: '',
  packQty: 1,
  packPrice: 0,
  shippingCost: 0,
  category: '',
  description: '',
  footprint: '',
};

/**
 * Master-detail screen ("Продавцы/Товары"): the left list holds the shops, the
 * right side the products (offers) of the selected shop. A product carries the package
 * quantity, the price and the delivery cost; the shop carries the (optional)
 * URL and a free-text description.
 */
export default function SellersPage() {
  const [sellers, setSellers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [products, setProducts] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [error, setError] = useState(null);

  const [sellerDialog, setSellerDialog] = useState(false);
  const [sellerDraft, setSellerDraft] = useState(EMPTY_SELLER);
  const [productDialog, setProductDialog] = useState(false);
  const [productDraft, setProductDraft] = useState(EMPTY_PRODUCT);

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Filters of the product list: an optional name and an optional category,
  // each matched as a substring or (with the checkbox on) as a regex.
  const [nameFilter, setNameFilter] = useState('');
  const [nameRegex, setNameRegex] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryRegex, setCategoryRegex] = useState(false);
  // Search scope: the products of the selected shop only, or of every shop.
  const [onlySelectedSeller, setOnlySelectedSeller] = useState(true);

  const filter = useMemo(
    () =>
      compileProductFilter({
        name: nameFilter,
        nameRegex,
        category: categoryFilter,
        categoryRegex,
      }),
    [nameFilter, nameRegex, categoryFilter, categoryRegex],
  );
  const scopedProducts = useMemo(
    () => scopeProducts(products, { sellerId: selectedId, onlySelectedSeller }),
    [products, selectedId, onlySelectedSeller],
  );
  const visibleProducts = useMemo(
    () => (filter.active ? scopedProducts.filter(filter.match) : scopedProducts),
    [scopedProducts, filter],
  );

  const { page, pageSize, setPage, setPageSize, pageItems } =
    usePagination(visibleProducts);

  const loadSellers = useCallback(async () => {
    try {
      const [list, categories] = await Promise.all([
        api.sellers.list(),
        api.products.categories(),
      ]);
      setSellers(list);
      setCategoryOptions(categories);
      setSelectedId((current) =>
        list.some((seller) => seller._id === current) ? current : list[0]?._id ?? null,
      );
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  function resetFilters() {
    setNameFilter('');
    setNameRegex(false);
    setCategoryFilter('');
    setCategoryRegex(false);
  }

  // The whole product list is loaded once: it is small, and with the scope
  // checkbox off the search has to run across every shop anyway.
  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.products.list());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

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
        <Typography variant="h5">Продавцы/Товары</Typography>
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
                  Товары (
                  {filter.active
                    ? `${visibleProducts.length} из ${scopedProducts.length}`
                    : scopedProducts.length}
                  )
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={resetFilters}
                    disabled={!nameFilter && !categoryFilter}
                  >
                    Сбросить фильтр
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={openProductNew}
                  >
                    Добавить товар
                  </Button>
                </Stack>
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 1 }}
              >
                <TextField
                  size="small"
                  label="Название"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  error={Boolean(filter.errors.name)}
                  helperText={filter.errors.name ? 'Некорректный регекс' : ' '}
                  sx={{ minWidth: 220 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={nameRegex}
                      onChange={(event) => setNameRegex(event.target.checked)}
                    />
                  }
                  label="регекс"
                  sx={{ mr: 2 }}
                />
                <TextField
                  size="small"
                  label="Категория"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  error={Boolean(filter.errors.category)}
                  helperText={filter.errors.category ? 'Некорректный регекс' : ' '}
                  sx={{ minWidth: 220 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={categoryRegex}
                      onChange={(event) => setCategoryRegex(event.target.checked)}
                    />
                  }
                  label="регекс"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={onlySelectedSeller}
                      onChange={(event) => setOnlySelectedSeller(event.target.checked)}
                    />
                  }
                  label="только выбранный магазин"
                  sx={{ ml: 2 }}
                />
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Название</TableCell>
                      <TableCell>Категория</TableCell>
                      <TableCell align="right">В упаковке</TableCell>
                      <TableCell align="right">Цена упаковки</TableCell>
                      <TableCell align="right">Доставка</TableCell>
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
                        <TableCell align="right">
                          {formatMoney(product.shippingCost)}
                        </TableCell>
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
                    {visibleProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9}>
                          <Typography variant="body2" color="text.secondary">
                            {scopedProducts.length > 0
                              ? 'По фильтру ничего не найдено.'
                              : onlySelectedSeller && selectedId
                                ? 'У этого продавца пока нет товаров.'
                                : 'Товаров пока нет.'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Pagination
                count={visibleProducts.length}
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
              label="Доставка"
              type="number"
              value={productDraft.shippingCost}
              onChange={(event) =>
                setProductDraft({ ...productDraft, shippingCost: event.target.value })
              }
              helperText="Подставляется в строки закупок, если доставка не задана вручную"
            />
            <Autocomplete
              freeSolo
              options={categoryOptions}
              value={productDraft.category ?? ''}
              onChange={(event, value) =>
                setProductDraft({ ...productDraft, category: value ?? '' })
              }
              onInputChange={(event, value) =>
                setProductDraft({ ...productDraft, category: value })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Категория (справочно)"
                  helperText="Список — уже введённые категории товаров и «Категории разбора»; можно ввести новую"
                />
              )}
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
