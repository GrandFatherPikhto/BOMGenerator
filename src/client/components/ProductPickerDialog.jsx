import { useEffect, useMemo, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
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
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';

import {
  PRODUCT_PICKER_COLUMNS,
  PRODUCT_PICKER_DEFAULT_COLUMNS,
  compileTextFilter,
  resolvePurchaseTotals,
} from '../../shared/index.js';
import { formatMoney } from '../format.js';
import { usePagination } from '../hooks/usePagination.js';
import { useUiState } from '../hooks/useUiState.js';
import { ClearButton } from './ClearableTextField.jsx';
import Pagination from './Pagination.jsx';

// Kept module-level: `useUiState` uses it as part of its memo dependencies.
const PICKER_DEFAULTS = { columns: PRODUCT_PICKER_DEFAULT_COLUMNS };

/** Fields the single search box looks through. */
const SEARCH_FIELDS = ['sellerName', 'name', 'url', 'category', 'footprint', 'description'];

/** Column labels, widths and alignment. `name` is always shown. */
const COLUMNS = {
  shop: { label: 'Магазин', width: 150 },
  name: { label: 'Название позиции', width: 220 },
  url: { label: 'URL', width: 90 },
  packQty: { label: 'В упак.', width: 90, align: 'right' },
  packPrice: { label: 'Цена упак.', width: 110, align: 'right' },
  shipping: { label: 'Дост.', width: 100, align: 'right' },
  category: { label: 'Категория', width: 130 },
  footprint: { label: 'Footprint', width: 130 },
  description: { label: 'Описание', width: 180 },
  total: { label: 'Итого', width: 130, align: 'right' },
};

/** The displayable text of one cell (the "Итого" column uses `totals`). */
function cellText(column, product, totals) {
  switch (column) {
    case 'shop':
      return product.sellerName ?? '';
    case 'name':
      return product.name ?? '';
    case 'url':
      return product.url || product.sellerUrl || '';
    case 'packQty':
      return product.packQty ?? '';
    case 'packPrice':
      return formatMoney(product.packPrice);
    case 'shipping':
      return formatMoney(product.shippingCost);
    case 'category':
      return product.category ?? '';
    case 'footprint':
      return product.footprint ?? '';
    case 'description':
      return product.description ?? '';
    case 'total':
      return totals?.cost === null || totals?.cost === undefined
        ? ''
        : formatMoney(totals.cost);
    default:
      return '';
  }
}

/** A comparable value for sorting the current column. */
function sortValue(column, product, totals) {
  switch (column) {
    case 'packQty':
      return Number(product.packQty) || 0;
    case 'packPrice':
      return Number(product.packPrice) || 0;
    case 'shipping':
      return Number(product.shippingCost) || 0;
    case 'total':
      return totals?.cost === null || totals?.cost === undefined
        ? Number.POSITIVE_INFINITY
        : totals.cost;
    default:
      return String(cellText(column, product, totals) ?? '');
  }
}

/** A narrow cell that truncates with an ellipsis and shows the full text on hover. */
function EllipsisCell({ align, children, full, width }) {
  return (
    <TableCell align={align} sx={{ maxWidth: width }}>
      <Tooltip title={full || ''} disableHoverListener={!full}>
        <Box
          component="span"
          sx={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {children}
        </Box>
      </Tooltip>
    </TableCell>
  );
}

/**
 * Modal table of offers for one BOM line. Opened by the "Таблица" button next to
 * the product field: it is the wide-screen alternative to the inline
 * `Autocomplete`, so the same search runs across every text field while the
 * columns are narrow and truncate with a tooltip.
 *
 * The visible-column choice is persisted per user through the UI state; the
 * search, sort and page are local to the open dialog.
 */
export default function ProductPickerDialog({
  open,
  onClose,
  row,
  products = [],
  selectedId = null,
  onSelect,
}) {
  // A plain media query keeps the component independent of a ThemeProvider
  // (the sm breakpoint is 600px) and makes it easy to test.
  const fullScreen = useMediaQuery('(max-width: 600px)');
  const [picker, updatePicker] = useUiState('productPicker', PICKER_DEFAULTS);
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [sort, setSort] = useState({ column: 'name', direction: 'asc' });
  const [columnsAnchor, setColumnsAnchor] = useState(null);

  // A fresh dialog starts with an empty search so the whole catalogue is reachable.
  useEffect(() => {
    if (open) {
      setQuery('');
      setRegex(false);
    }
  }, [open]);

  const storedColumns = Array.isArray(picker.columns) ? picker.columns : [];
  const visibleColumns = useMemo(() => {
    const set = new Set(storedColumns);
    set.add('name');
    return PRODUCT_PICKER_COLUMNS.filter((id) => set.has(id));
  }, [storedColumns]);

  const qty = Number(row?.totalQty ?? row?.qty ?? 0);

  const totalsById = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      map.set(product.id, resolvePurchaseTotals({ qty, product }));
    }
    return map;
  }, [products, qty]);

  const filter = useMemo(() => compileTextFilter(query, { regex }), [query, regex]);

  const filtered = useMemo(() => {
    if (!filter.active || !filter.match) {
      return products;
    }
    return products.filter((product) =>
      SEARCH_FIELDS.some((field) => filter.match(product[field])),
    );
  }, [products, filter]);

  const sorted = useMemo(() => {
    const direction = sort.direction === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const a = sortValue(sort.column, left, totalsById.get(left.id));
      const b = sortValue(sort.column, right, totalsById.get(right.id));
      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }
      return String(a).localeCompare(String(b), 'ru') * direction;
    });
  }, [filtered, sort, totalsById]);

  const { page, pageSize, setPage, setPageSize, pageItems } = usePagination(sorted, {
    resetKey: `${query}|${regex}|${sort.column}|${sort.direction}`,
  });

  function toggleSort(column) {
    setSort((previous) =>
      previous.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    );
  }

  function toggleColumn(column) {
    if (column === 'name') {
      return;
    }
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((id) => id !== column)
      : PRODUCT_PICKER_COLUMNS.filter((id) => id === column || visibleColumns.includes(id));
    updatePicker({ columns: next });
  }

  function choose(productId) {
    onSelect(productId);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      aria-labelledby="product-picker-title"
    >
      <DialogTitle id="product-picker-title">
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-start"
          justifyContent="space-between"
        >
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              Выбор товара
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {row?.value ?? 'Позиция'}
              {row?.footprint ? ` · ${row.footprint}` : ''} · Нужно {qty} шт
            </Typography>
          </Stack>
          <Tooltip title="Колонки">
            <IconButton
              onClick={(event) => setColumnsAnchor(event.currentTarget)}
              aria-label="Колонки"
            >
              <ViewColumnIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField
            size="small"
            fullWidth
            label="Поиск по магазину, названию, категории, footprint, описанию"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            InputProps={{
              endAdornment: query ? (
                <InputAdornment position="end">
                  <ClearButton title="Очистить поиск" onClick={() => setQuery('')} />
                </InputAdornment>
              ) : null,
            }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={regex}
                onChange={(event) => setRegex(event.target.checked)}
              />
            }
            label="регекс"
          />
        </Stack>

        {filter.error && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            Неверное регулярное выражение: {filter.error}
          </Alert>
        )}

        <TableContainer sx={{ maxHeight: '55vh' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column}
                    align={COLUMNS[column]?.align}
                    sortDirection={sort.column === column ? sort.direction : false}
                    sx={{ maxWidth: COLUMNS[column]?.width }}
                  >
                    <TableSortLabel
                      active={sort.column === column}
                      direction={sort.column === column ? sort.direction : 'asc'}
                      onClick={() => toggleSort(column)}
                    >
                      {COLUMNS[column]?.label ?? column}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {pageItems.map((product) => {
                const totals = totalsById.get(product.id);
                const selected = product.id === selectedId;
                return (
                  <TableRow
                    key={product.id}
                    hover
                    selected={selected}
                    onDoubleClick={() => choose(product.id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    {visibleColumns.map((column) => {
                      const text = cellText(column, product, totals);
                      const width = COLUMNS[column]?.width;
                      const align = COLUMNS[column]?.align;
                      if (column === 'total') {
                        const cost = totals?.cost;
                        const packs = totals?.packs;
                        const label =
                          cost === null || cost === undefined ? '' : formatMoney(cost);
                        return (
                          <EllipsisCell
                            key={column}
                            align={align}
                            width={width}
                            full={label ? `${label} · ${packs} уп` : ''}
                          >
                            {label ? (
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-end',
                                }}
                              >
                                <span>{label}</span>
                                <Typography variant="caption" color="text.secondary">
                                  {packs} уп
                                </Typography>
                              </Box>
                            ) : (
                              ''
                            )}
                          </EllipsisCell>
                        );
                      }
                      if (column === 'url') {
                        return (
                          <EllipsisCell
                            key={column}
                            align={align}
                            width={width}
                            full={text}
                          >
                            {text ? (
                              <a href={text} target="_blank" rel="noreferrer">
                                ссылка
                              </a>
                            ) : (
                              ''
                            )}
                          </EllipsisCell>
                        );
                      }
                      return (
                        <EllipsisCell
                          key={column}
                          align={align}
                          width={width}
                          full={String(text)}
                        >
                          {text}
                        </EllipsisCell>
                      );
                    })}
                    <TableCell align="right">
                      <Tooltip title="Выбрать этот товар">
                        <IconButton
                          size="small"
                          color={selected ? 'primary' : 'default'}
                          onClick={() => choose(product.id)}
                          aria-label="Выбрать этот товар"
                        >
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + 1}>
                    <Typography variant="body2" color="text.secondary">
                      Ничего не найдено
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Pagination
          count={sorted.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={() => choose(null)} disabled={!selectedId}>
          Очистить
        </Button>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>

      <Menu
        anchorEl={columnsAnchor}
        open={Boolean(columnsAnchor)}
        onClose={() => setColumnsAnchor(null)}
      >
        {PRODUCT_PICKER_COLUMNS.map((column) => (
          <MenuItem
            key={column}
            disabled={column === 'name'}
            onClick={() => toggleColumn(column)}
          >
            <Checkbox
              size="small"
              edge="start"
              checked={visibleColumns.includes(column)}
              tabIndex={-1}
              disableRipple
            />
            {COLUMNS[column]?.label ?? column}
          </MenuItem>
        ))}
      </Menu>
    </Dialog>
  );
}
