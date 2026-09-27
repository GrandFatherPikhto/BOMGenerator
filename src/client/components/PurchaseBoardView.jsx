import { Paper, Stack, Typography } from '@mui/material';

import { formatMoney } from '../format.js';
import { CommonCell, LinesTable, SellerCell, ShippingCell } from './LinesTable.jsx';

/**
 * Purchase table of one board: category blocks with inline editing of the
 * seller, the "Общие" flag and shipping, plus the "Итого" totals.
 *
 * Rows marked "Общие" are excluded from the board total (they are counted on
 * the "Общие закупки" sheet). Shared by the board screen and the "Закупки" tab.
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

  const columns = [
    { id: 'reference', label: 'Обозначение', sx: { whiteSpace: 'nowrap' } },
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
      render: (row) => (
        <CommonCell row={row} onChange={(changes) => onPatchLine(row.id, changes)} />
      ),
    },
    {
      id: 'seller',
      label: 'Продавец',
      render: (row) => (
        <SellerCell
          row={row}
          sellers={sellers}
          onChange={(changes) => onPatchLine(row.id, changes)}
        />
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
    { id: 'packs', label: 'Упаковок', align: 'right', render: (row) => row.packs ?? '' },
    {
      id: 'shipping',
      label: 'Доставка',
      align: 'right',
      render: (row) => (
        <ShippingCell row={row} onChange={(changes) => onPatchLine(row.id, changes)} />
      ),
    },
    {
      id: 'cost',
      label: 'Стоимость',
      align: 'right',
      render: (row) => formatMoney(row.cost),
    },
  ];

  return (
    <>
      <LinesTable blocks={blocks} columns={columns} />
      <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
        <Stack direction="row" justifyContent="flex-end" spacing={4}>
          <Typography>
            Доставка: <strong>{formatMoney(totals.shippingCost)}</strong>
          </Typography>
          <Typography variant="h6">Итого: {formatMoney(totals.cost)}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Позиции с галочкой «Общие» не входят в «Итого» — они считаются на листе
          «Общие закупки».
        </Typography>
      </Paper>
    </>
  );
}
