// CSV import / re-import.
import {
  buildMatchKey,
  collapseWhitespace,
  normalizeFootprint,
  parseQty,
  parseValue,
} from '../../shared/index.js';
import { badRequest, conflict, notFound } from '../lib/httpError.js';
import { parseBomCsv } from '../lib/csv.js';
import { Board } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { getSettings } from './settingsService.js';

const DNP_COLUMN = 'DNP';
const EXCLUDE_FROM_BOM_COLUMN = 'Exclude from BOM';

function isFlagged(value) {
  return String(value ?? '').trim() !== '';
}

function defaultNameFromFile(fileName) {
  return String(fileName).replace(/\.[^.]+$/, '');
}

/**
 * Import (or re-import) a board from a KiCad CSV export.
 *
 * Re-import is keyed by the source file name: the same name updates the
 * existing board. Rows are matched by `matchKey`, keeping the hand-filled
 * seller/common/shipping values; rows that disappeared from the file are
 * removed.
 *
 * `targetBoardId` names an existing board explicitly, which is required when
 * the export file was renamed: without it a new (duplicate) board would be
 * created and the old one would keep feeding the common purchases. The stored
 * `sourceFile` of the target acts as a guard — a mismatch raises a 409 unless
 * `renameSourceFile` confirms that the new name should be remembered.
 */
export async function importCsv({
  buffer,
  fileName,
  name,
  excludeDnp,
  excludeFromBom,
  targetBoardId,
  renameSourceFile,
}) {
  if (!fileName) {
    throw badRequest('A CSV file is required');
  }
  if (!buffer) {
    throw badRequest('The uploaded file is empty');
  }

  const settings = await getSettings();
  const { records } = parseBomCsv(buffer);
  const dropDnp =
    excludeDnp === undefined ? settings.excludeDnpByDefault : Boolean(excludeDnp);
  const dropExcludedFromBom =
    excludeFromBom === undefined
      ? settings.excludeFromBomByDefault
      : Boolean(excludeFromBom);

  // Aggregate duplicate match keys first (unique index per board).
  const aggregated = new Map();
  for (const record of records) {
    const reference = collapseWhitespace(record.Reference ?? '');
    if (!reference) {
      continue; // KiCad sometimes exports stray rows
    }
    if (dropDnp && isFlagged(record[DNP_COLUMN])) {
      continue;
    }
    if (dropExcludedFromBom && isFlagged(record[EXCLUDE_FROM_BOM_COLUMN])) {
      continue;
    }

    const rawValue = String(record.Value ?? '').trim();
    const value = rawValue || reference; // never leave the name empty
    const footprint = normalizeFootprint(record.Footprint ?? '');
    const qty = parseQty(record.Qty, reference);
    const matchKey = buildMatchKey(parseValue(value), footprint);

    const existing = aggregated.get(matchKey);
    if (existing) {
      existing.reference = existing.reference
        ? `${existing.reference},${reference}`
        : reference;
      existing.qty += qty;
    } else {
      aggregated.set(matchKey, {
        reference,
        qty,
        value,
        footprint,
        matchKey,
        raw: { ...record },
      });
    }
  }

  const incoming = String(fileName);
  const wantedName = String(name ?? '').trim();
  const rename = Boolean(renameSourceFile);
  const targetId = String(targetBoardId ?? '').trim();

  let board;
  if (targetId) {
    // Explicit re-import target: the user pointed at the exact board. Its
    // remembered file name guards against importing the wrong export.
    board = await Board.findById(targetId);
    if (!board) {
      throw notFound('Board not found');
    }
    if (board.isService) {
      throw badRequest('The service "Докупить" board cannot be re-imported');
    }
    const stored = board.sourceFile ?? '';
    if (stored && stored !== incoming && !rename) {
      throw conflict(
        `Файл «${incoming}» не совпадает с сохранённым именем «${stored}» платы «${board.name}». ` +
          'Подтвердите повторный импорт, чтобы запомнить новое имя файла.',
        {
          code: 'SOURCE_FILE_MISMATCH',
          boardId: String(board._id),
          boardName: board.name,
          storedFileName: stored,
          incomingFileName: incoming,
        },
      );
    }
    // The board name is managed on the board screen; an explicit target keeps it.
  } else {
    // Default: the file name identifies the board (the first import creates it).
    board = await Board.findOne({ sourceFile: incoming });
    if (!board) {
      board = new Board({
        sourceFile: incoming,
        name: wantedName || defaultNameFromFile(incoming),
      });
    } else if (wantedName) {
      board.name = wantedName;
    }
  }

  // The incoming name must never belong to a different board, otherwise the
  // board set would silently gain a duplicate of the same export.
  const colliding = await Board.findOne({
    sourceFile: incoming,
    _id: { $ne: board._id },
  });
  if (colliding) {
    throw conflict(
      `Файл «${incoming}» уже импортирован в плату «${colliding.name}». ` +
        'Выберите её как целевую для повторного импорта.',
      {
        code: 'SOURCE_FILE_TAKEN',
        boardId: String(colliding._id),
        boardName: colliding.name,
        incomingFileName: incoming,
      },
    );
  }

  const existingLines = await BomLine.find({ boardId: board._id });
  const byKey = new Map(existingLines.map((line) => [line.matchKey, line]));

  let added = 0;
  let updated = 0;
  for (const [matchKey, row] of aggregated) {
    const line = byKey.get(matchKey);
    if (line) {
      // Refresh CSV-sourced fields; hand-filled fields stay untouched.
      line.reference = row.reference;
      line.qty = row.qty;
      line.value = row.value;
      line.footprint = row.footprint;
      line.raw = row.raw;
      await line.save();
      byKey.delete(matchKey);
      updated += 1;
    } else {
      await BomLine.create({ boardId: board._id, ...row });
      added += 1;
    }
  }

  const removedKeys = [...byKey.keys()];
  if (removedKeys.length > 0) {
    await BomLine.deleteMany({
      boardId: board._id,
      matchKey: { $in: removedKeys },
    });
  }

  board.sourceFile = incoming;
  board.importedAt = new Date();
  await board.save();

  return {
    board,
    summary: {
      added,
      updated,
      removed: removedKeys.length,
      total: aggregated.size,
    },
  };
}
