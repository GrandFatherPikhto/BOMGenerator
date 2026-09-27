// KiCad BOM CSV reading.
import { parse } from 'csv-parse/sync';

// Columns KiCad always exports; the rest are optional and read by name.
export const REQUIRED_COLUMNS = ['Reference', 'Qty', 'Value', 'Footprint'];

/** Decode an uploaded buffer, tolerating a UTF-8 BOM at the start. */
export function decodeCsv(buffer) {
  let bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  return bytes.toString('utf8');
}

/**
 * Parse a KiCad BOM export. Columns are matched by name, extra columns are
 * kept as-is. Throws a 400 error when a required column is missing.
 */
export function parseBomCsv(buffer) {
  const text = decodeCsv(buffer);
  const records = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (records.length > 0 && missing.length > 0) {
    const error = new Error(
      `CSV is missing required column(s): ${missing.join(', ')}. Found: ${columns.join(', ')}`,
    );
    error.status = 400;
    throw error;
  }

  return { records, columns };
}
