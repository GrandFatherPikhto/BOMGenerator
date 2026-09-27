import { Box, Typography } from '@mui/material';

/**
 * Reference designators of one position (collapsed row detail). Renders null
 * when there is nothing to show, so the expander arrow is hidden.
 */
export default function ReferenceDesignators({ reference }) {
  const items = String(reference ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
        Обозначения ({items.length})
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {items.join(', ')}
      </Typography>
    </Box>
  );
}
