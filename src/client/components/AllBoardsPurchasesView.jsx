import { useMemo, useState } from 'react';

import { Link as RouterLink } from 'react-router-dom';

import { Link, Paper, Stack, Typography } from '@mui/material';

import { activeSellerId, compileLineFilter, filterBlocks } from '../../shared/index.js';
import { formatMoney } from '../format.js';
import { sellerOptionsFromProducts } from '../lib/sellerOptions.js';
import {
  DescriptionCell,
  LinesTable,
  NotPurchasedCell,
  PacksCell,
  ProductCell,
  SellerCell,
  ShippingCell,
} from './LinesTable.jsx';
import LineFiltersBar from './LineFiltersBar.jsx';

// Rows that share a component but come from different sources are highlighted:
// a hint that unifying the source saves on delivery.
const SOURCE_ROW_SX = { backgroundColor: '#fff3e0' };
const NOT_PURCHASED_ROW_SX = { backgroundColor: '#eeeeee', color: 'text.disabled' };

/**
 * "Все" tab: a summary of every enabled board. Rows are grouped by value +
 * footprint and the chosen source (product) — the same component bought from
 * different sellers shows up as several, highlighted rows. The "Платы" column
 * links back to the board purchase table, and every edit is applied to all the
 * board lines behind the row (bulk update).
 *
 * Filters and pagination are owned by the caller so they can be persisted in
 * the URL.
 */
export default function AllBoardsPurchasesView({
  view,
  products,
  filters,
  onFiltersChange,
  onPatchLines,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  boardHref,
}) {
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOf = (row) =>
    row.productId ? productMap.get(row.productId) ?? null : null;

  const rows = useMemo(
    () =>
      (view?.blocks ?? [])
        .filter((block) => block.kind === 'line')
        .map((block) => block.line),
    [view],
  );

  // A seller picked per row, same purpose as in PurchaseBoardView — see
  // SellerCell's doc comment. Keyed by matchKey: a row here represents every
  // line across boards that shares it, and that identity survives a product
  // change (the id of the "Все" row itself does not — it is re-grouped by
  // matchKey + productId on every reload).
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
    sellerOverrides[row.matchKey] ?? row.sellerId ?? (activeSeller || '');

  const effectiveFilters = useMemo(
    () => (activeSeller === filters.seller ? filters : { ...filters, seller: '' }),
    [filters, activeSeller],
  );

  const filter = useMemo(() => compileLineFilter(effectiveFilters), [effectiveFilters]);
  const visibleBlocks = useMemo(
    () => filterBlocks(view?.blocks ?? [], filter.match),
    [view, filter],
  );

  const patch = (row) => (changes) => onPatchLines(row.lineIds, changes);

  const columns = [
    { id: 'value', label: 'Наименование' },
    { id: 'footprint', label: 'Корпус/Footprint' },
    {
      id: 'boards',
      label: 'Платы',
      render: (row) => (
        <>
          {(row.boards ?? []).map((board, index) => (
            <span key={board.id}>
              {index > 0 ? ', ' : ''}
              <Link
                component={RouterLink}
                to={boardHref ? boardHref(board.id) : `/purchases?board=${board.id}`}
                underline="hover"
                title={`Перейти к закупке платы «${board.name}»`}
              >
                {board.name}
              </Link>
            </span>
          ))}
        </>
      ),
    },
    {
      id: 'totalQty',
      label: 'Итого',
      align: 'right',
      sx: { fontWeight: 'bold' },
      render: (row) => row.totalQty,
    },
    {
      id: 'notPurchased',
      label: 'Не закупается',
      render: (row) => <NotPurchasedCell row={row} onChange={patch(row)} />,
    },
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) => (
        <SellerCell
          value={rowSeller(row)}
          options={sellerOptions}
          onChange={(sellerId) => {
            setSellerOverrides((previous) => ({ ...previous, [row.matchKey]: sellerId }));
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
      render: (row) => (
        <ProductCell
          row={row}
          products={products}
          sellerFilter={rowSeller(row)}
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
      render: (row) => <PacksCell row={row} onChange={patch(row)} />,
    },
    {
      id: 'shipping',
      label: 'Доставка',
      align: 'right',
      render: (row) => <ShippingCell row={row} onChange={patch(row)} />,
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

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Компонент с разными источниками показан отдельными подсвеченными строками —
        объединение источника снижает расходы на доставку.
      </Typography>

      <LinesTable
        blocks={visibleBlocks}
        columns={columns}
        resetKey="all"
        rowSx={(row) =>
          row.notPurchased
            ? NOT_PURCHASED_ROW_SX
            : row.hasMultipleSources
              ? SOURCE_ROW_SX
              : undefined
        }
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
        <Stack direction="row" justifyContent="flex-end" spacing={4}>
          <Typography>
            Доставка: <strong>{formatMoney(view?.totals?.shippingCost)}</strong>
          </Typography>
          <Typography variant="h6">
            Итого: {formatMoney(view?.totals?.cost)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Позиции с галочкой «Общие» считаются на листе «Общие закупки» и здесь не
          показываются.
        </Typography>
      </Paper>
    </>
  );
}
