import { Box, Typography } from '@mui/material';

/**
 * Names (values) behind a footprint-grouped row, shown as the collapsed row
 * detail — the counterpart of ReferenceDesignators for a board line. Renders
 * null when there is nothing to show, so the expander arrow is hidden.
 */
export default function GroupNames({ names, footprint }) {
  const items = (names ?? []).map((name) => String(name)).filter(Boolean);
  if (items.length === 0) {
    return null;
  }
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5 }}
      >
        {footprint ? `Посадочное место: ${footprint} · ` : ''}
        Имена позиций ({items.length})
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {items.join(', ')}
      </Typography>
    </Box>
  );
}
