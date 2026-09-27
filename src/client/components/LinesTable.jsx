import { useEffect, useState } from 'react';

import {
  Checkbox,
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
 */
export function LinesTable({ blocks, columns }) {
  const colSpan = columns.length;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
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
                  <TableCell colSpan={colSpan} sx={CATEGORY_SX}>
                    {block.name}
                  </TableCell>
                </TableRow>
              );
            }
            if (block.kind === 'subcategory') {
              return (
                <TableRow key={`sub-${block.name}-${index}`}>
                  <TableCell colSpan={colSpan} sx={SUBCATEGORY_SX}>
                    {block.name}
                  </TableCell>
                </TableRow>
              );
            }
            const row = block.line;
            return (
              <TableRow key={row.id || row.matchKey} hover>
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
