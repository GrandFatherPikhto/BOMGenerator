import TablePagination from '@mui/material/TablePagination';

export const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

/** Classic "rows per page" pagination with a range counter. */
export default function Pagination({
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  return (
    <TablePagination
      component="div"
      count={count}
      page={page}
      rowsPerPage={pageSize}
      rowsPerPageOptions={PAGE_SIZE_OPTIONS}
      onPageChange={(event, newPage) => onPageChange(newPage)}
      onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
      labelRowsPerPage="Строк на странице:"
      labelDisplayedRows={({ from, to, count: total }) => `${from}–${to} из ${total}`}
    />
  );
}
