import { Fragment, useEffect, useMemo, useState } from 'react';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Checkbox,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';

import Pagination from './Pagination.jsx';

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
 */
export function LinesTable({ blocks, columns, renderDetail, rowSx }) {
  const hasDetail = typeof renderDetail === 'function';
  const columnSpan = columns.length + (hasDetail ? 1 : 0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  useEffect(() => {
    setPage(0);
  }, [blocks, pageSize]);

  const lineCount = useMemo(
    () => blocks.filter((block) => block.kind === 'line').length,
    [blocks],
  );
  const pages = useMemo(() => paginateBlocks(blocks, pageSize), [blocks, pageSize]);
  const safePage = Math.min(page, Math.max(0, pages.length - 1));
  const visibleBlocks = pages[safePage] ?? [];

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

const PAGE_SIZE_DEFAULT = 20;

/** Seller dropdown bound to a row. */
export function SellerCell({ row, sellers, onChange }) {
  return (
    <Select
      size="small"
      variant="standard"
      displayEmpty
      value={row.sellerId || ''}
      onChange={(event) => onChange({ sellerId: event.target.value || null })}
      sx={{ minWidth: 140 }}
    >
      <MenuItem value="">—</MenuItem>
      {sellers.map((seller) => (
        <MenuItem key={seller._id} value={seller._id}>
          {seller.name}
        </MenuItem>
      ))}
    </Select>
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

/** Shipping cost input that commits on blur. */
export function ShippingCell({ row, onChange }) {
  const [value, setValue] = useState(row.shippingCost ?? '');
  useEffect(() => {
    setValue(row.shippingCost ?? '');
  }, [row.shippingCost]);

  return (
    <TextField
      size="small"
      variant="standard"
      type="number"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const current = row.shippingCost ?? '';
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
      placeholder={row.packs === null || row.packs === undefined ? '' : String(row.packs)}
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
