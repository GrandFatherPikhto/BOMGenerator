import { Fragment, useEffect, useState } from 'react';

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
 * Renders grouped blocks (category/subcategory/line) with a configurable set of
 * columns. Column definitions use `render(row)` for editable or formatted cells.
 *
 * When `renderDetail` is provided, every line gets a leading expander arrow; the
 * detail (e.g. the reference designators) is hidden until expanded and is shown
 * in an extra row spanning the whole width. All rows start collapsed.
 */
export function LinesTable({ blocks, columns, renderDetail }) {
  const hasDetail = typeof renderDetail === 'function';
  const columnSpan = columns.length + (hasDetail ? 1 : 0);
  const [expanded, setExpanded] = useState(() => new Set());

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
          {blocks.map((block, index) => {
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
                <TableRow hover>
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
  );
}

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
