import { useMemo } from 'react';

import {
  Autocomplete,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';

import ClearableTextField, { ClearButton } from './ClearableTextField.jsx';
import { compileTextMatch } from '../../shared/index.js';

/** Initial (inactive) state of the purchase-table filters. */
export const EMPTY_LINE_FILTERS = {
  value: '',
  valueRegex: false,
  valueCaseSensitive: false,
  footprint: '',
  footprintRegex: false,
  footprintCaseSensitive: false,
  qtyOp: '',
  qty: '',
};

const QTY_OPTIONS = [
  { value: 'gt', label: 'больше' },
  { value: 'lt', label: 'меньше' },
  { value: 'eq', label: 'равно' },
];

/** Unique non-empty values, sorted the way a human would read them. */
function distinctValues(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, undefined, { numeric: true }),
  );
}

/**
 * Free-solo combobox with a clear cross, a "регекс" checkbox and a "учёт
 * регистра" checkbox. The dropdown offers the values present in the current
 * table, but any text can still be typed.
 */
function TextFilterField({
  label,
  value,
  onChange,
  options,
  regex,
  onRegexChange,
  caseSensitive,
  onCaseSensitiveChange,
}) {
  // A broken regex is surfaced right on the field; the shared compiler is the
  // single source of truth, so the message matches the real filtering.
  const error = regex ? compileTextMatch(value, { regex: true, caseSensitive }).error : null;

  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
      <Autocomplete
        freeSolo
        size="small"
        options={options}
        value={value || null}
        inputValue={value}
        onInputChange={(event, newValue, reason) => {
          if (reason !== 'reset') {
            onChange(newValue);
          }
        }}
        onChange={(event, newValue) => onChange(newValue ?? '')}
        disableClearable
        getOptionLabel={(option) => String(option ?? '')}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            error={Boolean(error)}
            helperText={error ? 'Некорректный регекс' : ' '}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {value ? (
                    <InputAdornment position="end">
                      <ClearButton
                        title={`Очистить: ${label}`}
                        onClick={() => onChange('')}
                      />
                    </InputAdornment>
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        sx={{ minWidth: 220 }}
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={regex}
            onChange={(event) => onRegexChange(event.target.checked)}
          />
        }
        label="регекс"
        sx={{ mt: 0.5 }}
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={caseSensitive}
            onChange={(event) => onCaseSensitiveChange(event.target.checked)}
          />
        }
        label="учёт регистра"
        sx={{ mt: 0.5 }}
      />
    </Stack>
  );
}

/** Quantity condition: an operator plus a number, compared with "Итого". */
function QtyFilterField({ op, qty, onOpChange, onQtyChange }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start">
      <TextField
        select
        size="small"
        label="Количество"
        value={op}
        onChange={(event) => onOpChange(event.target.value)}
        helperText=" "
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">—</MenuItem>
        {QTY_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <ClearableTextField
        size="small"
        type="number"
        label="Итого"
        value={qty}
        onChange={(event) => onQtyChange(event.target.value)}
        helperText=" "
        sx={{ width: 120 }}
      />
    </Stack>
  );
}

/**
 * Filter bar shared by the "Закупки" and "Общие закупки" tables. `rows` are the
 * line rows of the current table (used to fill the dropdowns), `filters` is the
 * state object (`EMPTY_LINE_FILTERS` shape) and `onChange` receives a partial
 * patch to merge into it.
 */
export default function LineFiltersBar({ rows, filters, onChange }) {
  const valueOptions = useMemo(() => distinctValues(rows.map((row) => row.value)), [rows]);
  const footprintOptions = useMemo(
    () => distinctValues(rows.map((row) => row.footprint)),
    [rows],
  );

  const patch = (changes) => onChange(changes);

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="flex-start"
      sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}
    >
      <TextFilterField
        label="Наименование"
        value={filters.value}
        onChange={(value) => patch({ value })}
        options={valueOptions}
        regex={filters.valueRegex}
        onRegexChange={(valueRegex) => patch({ valueRegex })}
        caseSensitive={filters.valueCaseSensitive}
        onCaseSensitiveChange={(valueCaseSensitive) => patch({ valueCaseSensitive })}
      />
      <TextFilterField
        label="Корпус/Footprint"
        value={filters.footprint}
        onChange={(footprint) => patch({ footprint })}
        options={footprintOptions}
        regex={filters.footprintRegex}
        onRegexChange={(footprintRegex) => patch({ footprintRegex })}
        caseSensitive={filters.footprintCaseSensitive}
        onCaseSensitiveChange={(footprintCaseSensitive) =>
          patch({ footprintCaseSensitive })
        }
      />
      <QtyFilterField
        op={filters.qtyOp}
        qty={filters.qty}
        onOpChange={(qtyOp) => patch({ qtyOp })}
        onQtyChange={(qty) => patch({ qty })}
      />
    </Stack>
  );
}
