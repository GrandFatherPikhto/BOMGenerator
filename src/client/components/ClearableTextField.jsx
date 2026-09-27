import ClearIcon from '@mui/icons-material/Clear';
import { IconButton, InputAdornment, TextField } from '@mui/material';

/**
 * Small "clear" cross reused by text filters and searchable Autocomplete
 * inputs. The button keeps `tabIndex={-1}` so it does not steal focus from the
 * field and can be triggered with the mouse without disturbing typing.
 */
export function ClearButton({ onClick, title = 'Очистить' }) {
  return (
    <IconButton
      size="small"
      edge="end"
      tabIndex={-1}
      aria-label={title}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <ClearIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * A `TextField` with a cross that appears as soon as the value is non-empty.
 * Clicking the cross fires the regular `onChange({ target: { value: '' } })`,
 * so the existing handlers keep working unchanged.
 */
export default function ClearableTextField({
  value,
  onChange,
  InputProps,
  ...props
}) {
  const showClear = value !== undefined && value !== null && String(value) !== '';
  const hasAdornment = showClear || Boolean(InputProps?.endAdornment);

  function handleClear() {
    if (onChange) {
      onChange({ target: { value: '' } });
    }
  }

  return (
    <TextField
      {...props}
      value={value}
      onChange={onChange}
      InputProps={{
        ...InputProps,
        // Only set the adornment when there is something to show: an empty one
        // would still switch the input into the "adorned" padding mode.
        ...(hasAdornment
          ? {
              endAdornment: (
                <>
                  {showClear && (
                    <InputAdornment position="end">
                      <ClearButton onClick={handleClear} />
                    </InputAdornment>
                  )}
                  {InputProps?.endAdornment}
                </>
              ),
            }
          : null),
      }}
    />
  );
}
