import { useMemo, useState } from 'react';

import { Paper, Stack, Tooltip, Typography } from '@mui/material';

import { activeSellerId, compileLineFilter, filterBlocks } from '../../shared/index.js';
import { formatMoney } from '../format.js';
import {
  CommonCell,
  DescriptionCell,
  LinesTable,
  NotPurchasedCell,
  PacksCell,
  ProductCell,
  ProductLabel,
  SellerCell,
  ShippingCell,
} from './LinesTable.jsx';
import { sellerOptionsFromProducts } from '../lib/sellerOptions.js';
import LineFiltersBar from './LineFiltersBar.jsx';
import ReferenceDesignators from './ReferenceDesignators.jsx';

const COMMON_ROW_SX = { backgroundColor: '#f5f5f5' };
const NOT_PURCHASED_ROW_SX = { backgroundColor: '#eeeeee', color: 'text.disabled' };

/**
 * Editable purchase table of one board: category blocks with inline editing of
 * the product, the "Общие" flag, packages, shipping and the note, plus the
 * "Итого" totals.
 *
 * The seller is not edited per row: it is derived from the chosen product. The
 * "Продавец" control in the filter bar keeps only its rows (and narrows the
 * product dropdown).
 *
 * Filters and pagination are owned by the caller (`PurchasesPage`) so they can
 * be persisted in the URL.
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
  filters,
  onFiltersChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  const rows = useMemo(
    () => blocks.filter((block) => block.kind === 'line').map((block) => block.line),
    [blocks],
  );

  // A seller picked per row (before a matching product is chosen, or to narrow
  // the product list away from what the row currently has). Not persisted by
  // itself — see SellerCell's doc comment. Keyed by line id, cleared on
  // navigation since the component remounts.
  const [sellerOverrides, setSellerOverrides] = useState({});

  // Every shop with products in the catalogue is offered, so a seller can be
  // chosen before any row has a product assigned.
  const sellerOptions = useMemo(
    () => sellerOptionsFromProducts(products),
    [products],
  );

  // A seller persisted from another board/tab is ignored: it neither filters the
  // rows nor narrows the product list here.
  const activeSeller = useMemo(
    () => activeSellerId(sellerOptions, filters.seller),
    [sellerOptions, filters.seller],
  );
  const rowSeller = (row) =>
    sellerOverrides[row.id] ?? row.sellerId ?? (activeSeller || '');

  const effectiveFilters = useMemo(
    () => (activeSeller === filters.seller ? filters : { ...filters, seller: '' }),
    [filters, activeSeller],
  );

  const filter = useMemo(() => compileLineFilter(effectiveFilters), [effectiveFilters]);
  const visibleBlocks = useMemo(
    () => filterBlocks(blocks, filter.match),
    [blocks, filter],
  );

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
      id: 'notPurchased',
      label: 'Не закупается',
      render: (row) =>
        row.common ? (
          <Tooltip title="Настраивается на вкладке «Общие закупки»">
            <span>
              <NotPurchasedCell row={row} onChange={patch(row)} disabled />
            </span>
          </Tooltip>
        ) : (
          <NotPurchasedCell row={row} onChange={patch(row)} />
        ),
    },
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) =>
        row.common ? (
          productOf(row)?.sellerName ?? ''
        ) : (
          <SellerCell
            value={rowSeller(row)}
            options={sellerOptions}
            disabled={Boolean(row.notPurchased)}
            onChange={(sellerId) => {
              setSellerOverrides((previous) => ({ ...previous, [row.id]: sellerId }));
              if (row.productId) {
                patch(row)({ productId: null });
              }
            }}
          />
        ),
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
            sellerFilter={rowSeller(row)}
            disabled={Boolean(row.notPurchased)}
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
      <LineFiltersBar
        rows={rows}
        filters={effectiveFilters}
        onChange={onFiltersChange}
        sellerOptions={sellerOptions}
      />

      <LinesTable
        blocks={visibleBlocks}
        columns={columns}
        resetKey={board.id}
        rowSx={(row) =>
          row.notPurchased ? NOT_PURCHASED_ROW_SX : row.common ? COMMON_ROW_SX : undefined
        }
        renderDetail={(row) => <ReferenceDesignators reference={row.reference} />}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
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
