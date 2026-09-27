import { Paper, Stack, Typography } from '@mui/material';

import { LinesTable } from './LinesTable.jsx';
import ReferenceDesignators from './ReferenceDesignators.jsx';

/**
 * Read-only BOM view of one board: name, footprint, quantity and the note.
 * Purchase data (seller, "Общие", shipping, cost) is deliberately not shown
 * here — it is edited on the "Закупки" tab.
 *
 * Reference designators are revealed per row with the expander arrow
 * (collapsed by default).
 */
export default function BomBoardView({ board, blocks }) {
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
    { id: 'description', label: 'Описание' },
  ];

  const lines = blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line);
  const totalPieces = lines.reduce((sum, line) => sum + (line.totalQty ?? 0), 0);

  return (
    <>
      <LinesTable
        blocks={blocks}
        columns={columns}
        resetKey={board.id}
        renderDetail={(row) => <ReferenceDesignators reference={row.reference} />}
      />
      <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
        <Stack direction="row" justifyContent="flex-end" spacing={4}>
          <Typography>
            Позиций: <strong>{lines.length}</strong>
          </Typography>
          <Typography variant="h6">Всего штук: {totalPieces}</Typography>
        </Stack>
      </Paper>
    </>
  );
}
