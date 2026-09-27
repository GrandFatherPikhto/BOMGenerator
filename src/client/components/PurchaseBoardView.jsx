import { Paper, Stack, Tooltip, Typography } from '@mui/material';

import { formatMoney } from '../format.js';
import {
  CommonCell,
  DescriptionCell,
  LinesTable,
  PacksCell,
  SellerCell,
  ShippingCell,
} from './LinesTable.jsx';
import ReferenceDesignators from './ReferenceDesignators.jsx';

const COMMON_ROW_SX = { backgroundColor: '#f5f5f5' };

/**
 * Editable purchase table of one board: category blocks with inline editing of
 * the seller, the "Общие" flag, packages, shipping and the note, plus the
 * "Итого" totals.
 *
 * A row marked "Общие" is purchased on the "Common purchases" sheet: its
 * seller, packages, shipping and cost are shown read-only here (the need is
 * aggregated across all boards) and are edited there. Reference designators are
 * revealed per row with the arrow (collapsed by default).
 */
export default function PurchaseBoardView({
  board,
  blocks,
  totals,
  sellers,
  onPatchLine,
}) {
  const sellerMap = new Map(sellers.map((seller) => [seller._id, seller]));
  const sellerOf = (row) => (row.sellerId ? sellerMap.get(row.sellerId) : null);
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
      render: (row) =>
        row.common ? (
          sellerOf(row)?.name ?? ''
        ) : (
          <SellerCell row={row} sellers={sellers} onChange={patch(row)} />
        ),
    },
    {
      id: 'packQty',
      label: 'В упаковке',
      align: 'right',
      render: (row) => sellerOf(row)?.packQty ?? '',
    },
    {
      id: 'packPrice',
      label: 'Цена упаковки',
      align: 'right',
      render: (row) => formatMoney(sellerOf(row)?.packPrice),
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
          «Общие закупки» (там же задаются продавец, упаковки и доставка).
        </Typography>
      </Paper>
    </>
  );
}
