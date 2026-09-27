import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import MuiPagination from '@mui/material/Pagination';

export const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

/**
 * Table footer: rows-per-page selector, a "X–Y из N" counter and a classic
 * numbered navigation (with first/last buttons and ellipsis for long ranges).
 */
export default function Pagination({
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(count, (page + 1) * pageSize);

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      justifyContent="flex-end"
      sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}
    >
      <TextField
        select
        size="small"
        label="Строк на странице"
        value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
        sx={{ width: 180 }}
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="body2" color="text.secondary">
        {from}–{to} из {count}
      </Typography>
      <MuiPagination
        count={pageCount}
        page={Math.min(page + 1, pageCount)}
        onChange={(event, value) => onPageChange(value - 1)}
        siblingCount={1}
        boundaryCount={1}
        showFirstButton
        showLastButton
        size="small"
        color="primary"
      />
    </Stack>
  );
}
