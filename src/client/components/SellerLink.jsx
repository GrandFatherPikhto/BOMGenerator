import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { IconButton } from '@mui/material';

/**
 * A small "open the seller page" link, shown only when the seller has a URL.
 * Used next to the seller dropdown so a price/link can be checked quickly.
 */
export default function SellerLink({ seller }) {
  if (!seller?.url) {
    return null;
  }
  return (
    <IconButton
      size="small"
      component="a"
      href={seller.url}
      target="_blank"
      rel="noreferrer"
      title={`Открыть страницу продавца${seller.name ? `: ${seller.name}` : ''}`}
    >
      <OpenInNewIcon fontSize="inherit" />
    </IconButton>
  );
}
