import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { IconButton } from '@mui/material';

/**
 * A small "open the page" link, rendered only when a URL is known.
 *
 * Products carry their own URL; when a product has none the seller URL is used
 * as a fallback, so the caller passes the already-resolved `url`.
 */
export default function SellerLink({ url, name, title }) {
  if (!url) {
    return null;
  }
  return (
    <IconButton
      size="small"
      component="a"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={title ?? `Открыть ссылку${name ? `: ${name}` : ''}`}
    >
      <OpenInNewIcon fontSize="inherit" />
    </IconButton>
  );
}
