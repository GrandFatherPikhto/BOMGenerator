import { useMemo, useState } from 'react';

import {
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { formatMoney } from '../format.js';
import {
  CommonCell,
  DescriptionCell,
  LinesTable,
  PacksCell,
  ProductCell,
  ProductLabel,
  ShippingCell,
} from './LinesTable.jsx';
import ReferenceDesignators from './ReferenceDesignators.jsx';

const COMMON_ROW_SX = { backgroundColor: '#f5f5f5' };

/**
 * Editable purchase table of one board: category blocks with inline editing of
 * the product, the "Общие" flag, packages, shipping and the note, plus the
 * "Итого" totals.
 *
 * The seller is not edited per row: it is derived from the chosen product (a
 * seller has many products). The "Продавец" control above the table is a filter
 * that narrows the product dropdown.
 *
 * A row marked "Общие" is purchased on the "Common purchases" sheet: its
 * product, packages, shipping and cost are shown read-only here (the need is
 * aggregated across all boards) and are edited there. Reference designators are
 * revealed per row with the arrow (collapsed by default).
 */
export default function PurchaseBoardView({
  board,
  blocks,
  totals,
  products,
  onPatchLine,
}) {
  const [sellerFilter, setSellerFilter] = useState('');

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  // The seller filter lists only sellers that actually have products.
  const sellerOptions = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (product.sellerId && !map.has(product.sellerId)) {
        map.set(product.sellerId, product.sellerName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const patch = (row) => (changes) => onPatchLine(row.id, changes);

  const columns = [
    { id: 'value', label: 'Наименование' },
    { id: 'footprint', label: 'Корпус/Footprint' },
    { id: 'qty', label: 'Штук на плату', align: 'right' },
    { id: 'boardCount', label: 'Плат', align: 'right', render: () => board.count },
    {
      id: 'totalQty',
      label: 'Итого',
      align: 'right',
      sx: { fontWeight: 'bold' },
      render: (row) => row.totalQty,
    },
    {
      id: 'common',
      label: 'Общие',
      render: (row) => <CommonCell row={row} onChange={patch(row)} />,
    },
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) => productOf(row)?.sellerName ?? '',
    },
    {
      id: 'product',
      label: 'Товар',
      render: (row) =>
        row.common ? (
          <Tooltip title="Товар для строки «Общие» выбирается на вкладке «Общие закупки»">
            <span>
              {productOf(row) ? <ProductLabel product={productOf(row)} /> : '—'}
            </span>
          </Tooltip>
        ) : (
          <ProductCell
            row={row}
            products={products}
            sellerFilter={sellerFilter}
            onChange={patch(row)}
          />
        ),
    },
    {
      id: 'packQty',
      label: 'В упаковке',
      align: 'right',
      render: (row) => productOf(row)?.packQty ?? '',
    },
    {
      id: 'packPrice',
      label: 'Цена упаковки',
      align: 'right',
      render: (row) => formatMoney(productOf(row)?.packPrice),
    },
    {
      id: 'packs',
      label: 'Упаковок',
      align: 'right',
      render: (row) =>
        row.common ? (
          <Tooltip title="Считается на листе «Общие закупки»">
            <span>{row.packs ?? ''}</span>
          </Tooltip>
        ) : (
          <PacksCell row={row} onChange={patch(row)} />
        ),
    },
    {
      id: 'shipping',
      label: 'Доставка',
      align: 'right',
      render: (row) =>
        row.common ? (
          row.shippingCost ?? ''
        ) : (
          <ShippingCell row={row} onChange={patch(row)} />
        ),
    },
    {
      id: 'cost',
      label: 'Стоимость',
      align: 'right',
      render: (row) => formatMoney(row.cost),
    },
    {
      id: 'description',
      label: 'Описание',
      render: (row) => <DescriptionCell row={row} onChange={patch(row)} />,
    },
  ];

  return (
    <>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
        <TextField
          select
          size="small"
          label="Продавец (фильтр)"
          value={sellerFilter}
          onChange={(event) => setSellerFilter(event.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">Все продавцы</MenuItem>
          {sellerOptions.map((seller) => (
            <MenuItem key={seller.id} value={seller.id}>
              {seller.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          Фильтр сужает список товаров в колонке «Товар».
        </Typography>
      </Stack>

      <LinesTable
        blocks={blocks}
        columns={columns}
        resetKey={board.id}
        rowSx={(row) => (row.common ? COMMON_ROW_SX : undefined)}
        renderDetail={(row) => <ReferenceDesignators reference={row.reference} />}
      />
      <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
        <Stack direction="row" justifyContent="flex-end" spacing={4}>
          <Typography>
            Доставка: <strong>{formatMoney(totals.shippingCost)}</strong>
          </Typography>
          <Typography variant="h6">Итого: {formatMoney(totals.cost)}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Позиции с галочкой «Общие» не входят в «Итого» и закупаются на листе
          «Общие закупки» (там же задаются товар, упаковки и доставка).
        </Typography>
      </Paper>
    </>
  );
}
