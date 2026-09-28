import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Autocomplete,
  Checkbox,
  IconButton,
  InputAdornment,
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

import { ClearButton } from './ClearableTextField.jsx';
import Pagination from './Pagination.jsx';
import SellerLink from './SellerLink.jsx';

const CATEGORY_SX = {
  fontWeight: 'bold',
  textTransform: 'uppercase',
  backgroundColor: '#bdd7ee',
  letterSpacing: 0.5,
};
const SUBCATEGORY_SX = {
  fontStyle: 'italic',
  backgroundColor: '#ddebf7',
  pl: 4,
};

/**
 * Split grouped blocks into pages of `pageSize` line rows. Category and
 * subcategory headers do not count as rows; when a block continues on the next
 * page its headers are repeated at the top of that page.
 */
export function paginateBlocks(blocks, pageSize) {
  if (!pageSize || pageSize <= 0) {
    return [blocks];
  }
  const pages = [];
  let current = [];
  let rowsInPage = 0;
  let lastCategory = null;
  let lastSubcategory = null;

  const closePage = (repeatContext) => {
    pages.push(current);
    current = [];
    rowsInPage = 0;
    if (repeatContext) {
      if (lastCategory) {
        current.push({ ...lastCategory, repeated: true });
      }
      if (lastSubcategory) {
        current.push({ ...lastSubcategory, repeated: true });
      }
    }
  };

  for (const block of blocks) {
    if (block.kind === 'category') {
      lastCategory = block;
      lastSubcategory = null;
    } else if (block.kind === 'subcategory') {
      lastSubcategory = block;
    }

    if (block.kind === 'line') {
      if (rowsInPage >= pageSize) {
        closePage(true);
      }
      current.push(block);
      rowsInPage += 1;
    } else {
      current.push(block);
    }
  }
  pages.push(current);
  return pages;
}

/**
 * Renders grouped blocks (category/subcategory/line) with a configurable set of
 * columns and client-side pagination. Column definitions use `render(row)` for
 * editable or formatted cells.
 *
 * When `renderDetail` is provided, every line gets a leading expander arrow; the
 * detail (e.g. the reference designators) is hidden until expanded. All rows
 * start collapsed. `rowSx(row)` can style a whole line row.
 *
 * Pagination is internal by default; pass `page`/`pageSize` (and their change
 * handlers) to control it from the outside — then the caller owns the reset,
 * which is what the URL-backed purchases screen needs.
 */
export function LinesTable({
  blocks,
  columns,
  renderDetail,
  rowSx,
  resetKey,
  page: pageProp,
  pageSize: pageSizeProp,
  onPageChange,
  onPageSizeChange,
}) {
  const hasDetail = typeof renderDetail === 'function';
  const columnSpan = columns.length + (hasDetail ? 1 : 0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [internalPage, setInternalPage] = useState(0);
  const [internalSize, setInternalSize] = useState(PAGE_SIZE_DEFAULT);

  const pageControlled = pageProp !== undefined;
  const sizeControlled = pageSizeProp !== undefined;
  const page = pageControlled ? pageProp : internalPage;
  const pageSize = sizeControlled ? pageSizeProp : internalSize;

  const setPage = useCallback(
    (next) => {
      const value = typeof next === 'function' ? next(page) : next;
      if (pageControlled) {
        onPageChange?.(value);
      } else {
        setInternalPage(value);
      }
    },
    [pageControlled, onPageChange, page],
  );
  const setPageSize = useCallback(
    (next) => {
      if (sizeControlled) {
        onPageSizeChange?.(next);
      } else {
        setInternalSize(next);
      }
    },
    [sizeControlled, onPageSizeChange],
  );

  // Reset only when the table context changes (another board/mode) or the page
  // size changes — never on a data refresh, so inline editing keeps the page.
  // Skipped when the page is controlled: the caller resets it.
  useEffect(() => {
    if (!pageControlled) {
      setInternalPage(0);
    }
  }, [resetKey, pageSize, pageControlled]);

  const lineCount = useMemo(
    () => blocks.filter((block) => block.kind === 'line').length,
    [blocks],
  );
  const pages = useMemo(() => paginateBlocks(blocks, pageSize), [blocks, pageSize]);
  const safePage = Math.min(page, Math.max(0, pages.length - 1));
  const visibleBlocks = pages[safePage] ?? [];

  // Clamp when the number of pages shrinks (e.g. rows were removed).
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length, setPage]);

  function toggle(key) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {hasDetail && <TableCell sx={{ width: 36 }} />}
              {columns.map((column) => (
                <TableCell key={column.id} align={column.align || 'left'}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleBlocks.map((block, index) => {
              if (block.kind === 'category') {
                return (
                  <TableRow key={`category-${block.name}-${index}`}>
                    <TableCell colSpan={columnSpan} sx={CATEGORY_SX}>
                      {block.name}
                    </TableCell>
                  </TableRow>
                );
              }
              if (block.kind === 'subcategory') {
                return (
                  <TableRow key={`sub-${block.name}-${index}`}>
                    <TableCell colSpan={columnSpan} sx={SUBCATEGORY_SX}>
                      {block.name}
                    </TableCell>
                  </TableRow>
                );
              }

              const row = block.line;
              const rowKey = row.id || row.matchKey || `line-${index}`;
              const detail = hasDetail ? renderDetail(row) : null;
              const isOpen = detail ? expanded.has(rowKey) : false;

              return (
                <Fragment key={rowKey}>
                  <TableRow hover sx={rowSx ? rowSx(row) : undefined}>
                    {hasDetail && (
                      <TableCell sx={{ width: 36, p: 0.5 }}>
                        {detail ? (
                          <IconButton
                            size="small"
                            aria-label="Показать обозначения"
                            onClick={() => toggle(rowKey)}
                          >
                            {isOpen ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        ) : null}
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.align || 'left'}
                        sx={column.sx}
                      >
                        {column.render ? column.render(row) : row[column.id]}
                      </TableCell>
                    ))}
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell
                        colSpan={columnSpan}
                        sx={{ backgroundColor: '#fafafa', py: 0.5 }}
                      >
                        {detail}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Pagination
        count={lineCount}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}

export const PAGE_SIZE_DEFAULT = 20;

/** Link to a product page; falls back to the seller page when it has no URL. */
export function ProductLink({ product }) {
  const url = product?.url || product?.sellerUrl || '';
  if (!url) {
    return null;
  }
  return (
    <SellerLink
      url={url}
      name={product?.name}
      title={`Открыть товар${product?.name ? `: ${product.name}` : ''}`}
    />
  );
}

/**
 * Searchable product picker bound to a row. `sellerFilter` (a seller id or '')
 * narrows the list; the free-text search matches the product name/url or the
 * seller name/url, so an offer can be found either way.
 */
export function ProductCell({ row, products, sellerFilter, onChange }) {
  const options = sellerFilter
    ? products.filter((product) => product.sellerId === sellerFilter)
    : products;
  const selected = row.productId
    ? products.find((product) => product.id === row.productId) ?? null
    : null;
  // The free-text query is kept in state so the cross can also clear a search
  // that has not been confirmed with a product yet.
  const [query, setQuery] = useState('');

  function clearSearch() {
    setQuery('');
    if (selected) {
      onChange({ productId: null });
    }
  }

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Autocomplete
        size="small"
        options={options}
        value={selected}
        inputValue={query}
        onInputChange={(event, value) => setQuery(value)}
        onChange={(event, value) => onChange({ productId: value ? value.id : null })}
        disableClearable
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        filterOptions={(list, state) => {
          const needle = state.inputValue.trim().toLowerCase();
          if (!needle) {
            return list;
          }
          return list.filter((product) =>
            [product.name, product.url, product.sellerName, product.sellerUrl]
              .filter(Boolean)
              .some((text) => text.toLowerCase().includes(needle)),
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            placeholder="—"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {(query || selected) && (
                    <InputAdornment position="end">
                      <ClearButton title="Очистить поиск товара" onClick={clearSearch} />
                    </InputAdornment>
                  )}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        sx={{ minWidth: 220 }}
      />
      <ProductLink product={selected} />
    </Stack>
  );
}

/** Read-only product name plus a link — used for the "Общие" rows. */
export function ProductLabel({ product }) {
  if (!product) {
    return null;
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Typography variant="body2">{product.name}</Typography>
      <ProductLink product={product} />
    </Stack>
  );
}

/** "Общие" checkbox bound to a row. */
export function CommonCell({ row, onChange }) {
  return (
    <Checkbox
      size="small"
      checked={Boolean(row.common)}
      onChange={(event) => onChange({ common: event.target.checked })}
    />
  );
}

/**
 * Shipping cost input that commits on blur. An empty value means "auto": the
 * delivery cost of the chosen product is used, and it is shown as a hint.
 */
export function ShippingCell({ row, onChange }) {
  const [value, setValue] = useState(row.shippingOverride ?? '');
  useEffect(() => {
    setValue(row.shippingOverride ?? '');
  }, [row.shippingOverride]);

  return (
    <TextField
      size="small"
      variant="standard"
      type="number"
      value={value}
      placeholder={
        row.mixed?.shipping
          ? 'разные'
          : row.shippingCost === null || row.shippingCost === undefined
            ? ''
            : String(row.shippingCost)
      }
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const current = row.shippingOverride ?? '';
        if (String(current) !== String(value)) {
          onChange({ shippingCost: value === '' ? null : Number(value) });
        }
      }}
      sx={{ width: 90 }}
    />
  );
}

/**
 * Package-count override input that commits on blur. An empty value means
 * "auto" (ceil of the need); the auto value is shown as a placeholder hint.
 */
export function PacksCell({ row, onChange }) {
  const [value, setValue] = useState(row.packsOverride ?? '');
  useEffect(() => {
    setValue(row.packsOverride ?? '');
  }, [row.packsOverride]);

  return (
    <TextField
      size="small"
      variant="standard"
      type="number"
      value={value}
      placeholder={
        row.mixed?.packs
          ? 'разные'
          : row.packs === null || row.packs === undefined
            ? ''
            : String(row.packs)
      }
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const current = row.packsOverride ?? '';
        if (String(current) !== String(value)) {
          onChange({ packsOverride: value === '' ? null : Number(value) });
        }
      }}
      sx={{ width: 70 }}
    />
  );
}

/** Free-text description input that commits on blur. */
export function DescriptionCell({ row, onChange }) {
  const [value, setValue] = useState(row.description ?? '');
  useEffect(() => {
    setValue(row.description ?? '');
  }, [row.description]);

  return (
    <TextField
      size="small"
      variant="standard"
      multiline
      value={value}
      placeholder={row.mixed?.description ? 'разные' : ''}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const current = row.description ?? '';
        if (String(current) !== String(value)) {
          onChange({ description: value });
        }
      }}
      sx={{ minWidth: 220 }}
    />
  );
}

/** Integer quantity input that commits on blur (manual lines only). */
export function QuantityCell({ row, onChange }) {
  const [value, setValue] = useState(row.qty ?? '');
  useEffect(() => {
    setValue(row.qty ?? '');
  }, [row.qty]);

  return (
    <TextField
      size="small"
      variant="standard"
      type="number"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (String(row.qty) !== String(value) && value !== '') {
          onChange({ qty: Number(value) });
        }
      }}
      sx={{ width: 70 }}
    />
  );
}
