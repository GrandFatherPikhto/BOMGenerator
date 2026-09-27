// Boards, their BOM lines and the computed purchase columns.
import {
  buildMatchKey,
  collapseWhitespace,
  normalizeFootprint,
  parseQty,
  parseValue,
} from '../../shared/index.js';
import { badRequest, conflict, notFound } from '../lib/httpError.js';
import { Board, SERVICE_BOARD_NAME } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { listRuntimeCategories } from './categoryService.js';
import { classifyLine, groupIntoBlocks, serializeBlocks } from './grouping.js';
import { getSettings } from './settingsService.js';

export function serializeBoard(board) {
  return {
    id: String(board._id),
    name: board.name,
    sourceFile: board.sourceFile ?? null,
    count: board.count ?? 1,
    isService: Boolean(board.isService),
    // Documents created before these flags existed behave as "on".
    enabled: board.enabled !== false,
    inCommon: board.inCommon !== false,
    importedAt: board.importedAt ?? null,
  };
}

/** The single "Докупить" board that holds manually added positions. */
export async function ensureServiceBoard() {
  let board = await Board.findOne({ isService: true });
  if (!board) {
    board = await Board.create({
      name: SERVICE_BOARD_NAME,
      isService: true,
      count: 1,
    });
  }
  return board;
}

export async function listBoards() {
  await ensureServiceBoard();
  const boards = await Board.find().sort({ isService: 1, name: 1 }).lean();
  const counts = await BomLine.aggregate([
    { $group: { _id: '$boardId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
  return boards.map((board) => ({
    ...serializeBoard(board),
    lineCount: countMap.get(String(board._id)) ?? 0,
  }));
}

export async function getBoard(id) {
  const board = await Board.findById(id).lean();
  if (!board) {
    throw notFound('Board not found');
  }
  return board;
}

export async function createBoard(payload = {}) {
  const name = String(payload.name ?? '').trim();
  if (!name) {
    throw badRequest('name is required');
  }
  const count = Number(payload.count ?? 1);
  const board = await Board.create({
    name,
    count: Number.isFinite(count) && count >= 1 ? count : 1,
  });
  return board;
}

export async function updateBoard(id, payload = {}) {
  const board = await Board.findById(id);
  if (!board) {
    throw notFound('Board not found');
  }
  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) {
      throw badRequest('name must not be empty');
    }
    board.name = name;
  }
  if (payload.count !== undefined) {
    const count = Number(payload.count);
    if (!Number.isFinite(count) || count < 1) {
      throw badRequest('count must be a number >= 1');
    }
    board.count = count;
  }
  if (payload.enabled !== undefined) {
    board.enabled = Boolean(payload.enabled);
  }
  if (payload.inCommon !== undefined) {
    board.inCommon = Boolean(payload.inCommon);
  }
  await board.save();
  return board;
}

export async function deleteBoard(id) {
  const board = await Board.findById(id);
  if (!board) {
    throw notFound('Board not found');
  }
  if (board.isService) {
    throw badRequest('The service "Докупить" board cannot be deleted');
  }
  await BomLine.deleteMany({ boardId: board._id });
  await board.deleteOne();
  return board;
}

function computeRow(line, board, sellerMap, categories, settings, common) {
  const { parsed, display, category, subcategory, sort } = classifyLine(
    line,
    categories,
    settings,
  );
  const isCommon = Boolean(line.common);

  // A "Общие" position is purchased on the "Common purchases" sheet: its seller,
  // shipping and packages come from the shared override (and the need is summed
  // across all boards), not from this line.
  const override = isCommon ? common.overrideByKey.get(line.matchKey) ?? null : null;
  const effectiveSellerId = isCommon
    ? override?.sellerId ?? null
    : line.sellerId ?? null;
  const seller = effectiveSellerId
    ? sellerMap.get(String(effectiveSellerId)) ?? null
    : null;

  const totalQty = (line.qty ?? 0) * (board.count ?? 1);
  const purchaseQty = isCommon
    ? common.totalByKey.get(line.matchKey) ?? totalQty
    : totalQty;
  const packsOverride = isCommon
    ? override?.packsOverride ?? null
    : line.packsOverride ?? null;
  const packs =
    packsOverride ?? (seller ? Math.ceil(purchaseQty / seller.packQty) : null);
  const shippingCost = isCommon
    ? override?.shippingCost ?? null
    : line.shippingCost ?? null;
  const cost =
    packs !== null && seller ? packs * seller.packPrice + (shippingCost || 0) : null;

  return {
    id: String(line._id),
    reference: line.reference ?? '',
    qty: line.qty ?? 0,
    value: display,
    valueRaw: line.value ?? '',
    footprint: line.footprint ?? '',
    matchKey: line.matchKey,
    sellerId: effectiveSellerId ? String(effectiveSellerId) : null,
    common: isCommon,
    shippingCost,
    description: line.description ?? '',
    manual: Boolean(line.manual),
    totalQty,
    purchaseQty,
    packsOverride,
    packs,
    cost,
    parsed,
    display,
    category,
    subcategory,
    sort,
  };
}

/**
 * Board view: category/subcategory blocks of rows with ready-made calculated
 * columns and a "Итого" total that excludes `common` rows (they are counted on
 * the "Common purchases" sheet instead).
 */
export async function getBoardView(boardId) {
  const board = await Board.findById(boardId).lean();
  if (!board) {
    throw notFound('Board not found');
  }
  const [settings, categories, lines, sellers, boards, commonLines, overrides] =
    await Promise.all([
      getSettings(),
      listRuntimeCategories(),
      BomLine.find({ boardId: board._id }).lean(),
      Seller.find().lean(),
      Board.find().lean(),
      BomLine.find({ common: true }).lean(),
      CommonPurchaseOverride.find().lean(),
    ]);
  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));

  // Only boards that are enabled AND marked "in common purchases" contribute.
  const participatingCount = new Map(
    boards
      .filter((item) => item.enabled !== false && item.inCommon !== false)
      .map((item) => [String(item._id), item.count ?? 1]),
  );
  const commonTotalByKey = new Map();
  for (const line of commonLines) {
    const factor = participatingCount.get(String(line.boardId));
    if (factor === undefined) {
      continue;
    }
    const current = commonTotalByKey.get(line.matchKey) ?? 0;
    commonTotalByKey.set(line.matchKey, current + (line.qty ?? 0) * factor);
  }
  const common = {
    totalByKey: commonTotalByKey,
    overrideByKey: new Map(overrides.map((item) => [item.matchKey, item])),
  };

  const rows = lines.map((line) =>
    computeRow(line, board, sellerMap, categories, settings, common),
  );
  const blocks = groupIntoBlocks(rows, categories, settings);

  const totals = { cost: 0, shippingCost: 0 };
  for (const row of rows) {
    if (row.common) {
      continue;
    }
    if (row.cost !== null) {
      totals.cost += row.cost;
    }
    if (row.shippingCost !== null) {
      totals.shippingCost += row.shippingCost;
    }
  }

  return { board: serializeBoard(board), blocks: serializeBlocks(blocks), totals };
}

/**
 * Update the hand-filled fields of a line. Manual ("Докупить") lines may also
 * change their value/qty/footprint/reference, which recomputes the match key.
 */
export async function updateLine(lineId, payload = {}) {
  const line = await BomLine.findById(lineId);
  if (!line) {
    throw notFound('Line not found');
  }
  const errors = [];

  if (payload.sellerId !== undefined) {
    if (payload.sellerId === null || payload.sellerId === '') {
      line.sellerId = null;
    } else {
      const seller = await Seller.findById(payload.sellerId);
      if (!seller) {
        errors.push('sellerId does not exist');
      } else {
        line.sellerId = seller._id;
      }
    }
  }

  if (payload.common !== undefined) {
    line.common = Boolean(payload.common);
  }

  if (payload.shippingCost !== undefined) {
    if (payload.shippingCost === null || payload.shippingCost === '') {
      line.shippingCost = null;
    } else {
      const shipping = Number(payload.shippingCost);
      if (!Number.isFinite(shipping) || shipping < 0) {
        errors.push('shippingCost must be a number >= 0');
      } else {
        line.shippingCost = shipping;
      }
    }
  }

  if (payload.description !== undefined) {
    const description = String(payload.description ?? '').trim();
    if (description.length > 500) {
      errors.push('description must be at most 500 characters');
    } else {
      line.description = description;
    }
  }

  if (payload.packsOverride !== undefined) {
    if (payload.packsOverride === null || payload.packsOverride === '') {
      line.packsOverride = null;
    } else {
      const packs = Number(payload.packsOverride);
      if (!Number.isInteger(packs) || packs < 0) {
        errors.push('packsOverride must be a non-negative integer');
      } else {
        line.packsOverride = packs;
      }
    }
  }

  const touchesIdentity =
    payload.value !== undefined ||
    payload.footprint !== undefined ||
    payload.qty !== undefined ||
    payload.reference !== undefined;
  if (touchesIdentity) {
    if (!line.manual) {
      errors.push('value/quantity of an imported line cannot be edited');
    } else {
      const reference =
        payload.reference !== undefined
          ? String(payload.reference).trim()
          : line.reference;
      const value =
        payload.value !== undefined ? collapseWhitespace(payload.value) : line.value;
      if (!value && !reference) {
        errors.push('value is required');
      } else {
        const footprint =
          payload.footprint !== undefined
            ? normalizeFootprint(payload.footprint)
            : line.footprint;
        const qty =
          payload.qty !== undefined
            ? parseQty(payload.qty, reference) || 1
            : line.qty;
        const matchKey = buildMatchKey(parseValue(value || reference), footprint);
        if (matchKey !== line.matchKey) {
          const duplicate = await BomLine.findOne({
            boardId: line.boardId,
            matchKey,
            _id: { $ne: line._id },
          });
          if (duplicate) {
            throw conflict('A line with the same value and footprint already exists');
          }
        }
        line.reference = reference;
        line.value = value || reference;
        line.footprint = footprint;
        line.qty = qty;
        line.matchKey = matchKey;
      }
    }
  }

  if (errors.length > 0) {
    throw badRequest(errors.join('; '), errors);
  }
  await line.save();
  return line;
}

export async function deleteLine(lineId) {
  const line = await BomLine.findByIdAndDelete(lineId);
  if (!line) {
    throw notFound('Line not found');
  }
  return line;
}

/** Add a hand-typed line (used by the "Докупить" board). */
export async function addManualLine(boardId, payload = {}) {
  const board = await Board.findById(boardId);
  if (!board) {
    throw notFound('Board not found');
  }
  const reference = String(payload.reference ?? '').trim();
  const value = collapseWhitespace(payload.value ?? '');
  if (!value && !reference) {
    throw badRequest('value is required');
  }
  const footprint = normalizeFootprint(payload.footprint ?? '');
  const matchKey = buildMatchKey(parseValue(value || reference), footprint);

  const duplicate = await BomLine.findOne({ boardId: board._id, matchKey });
  if (duplicate) {
    throw conflict('A line with the same value and footprint already exists');
  }

  const line = await BomLine.create({
    boardId: board._id,
    reference,
    qty: parseQty(payload.qty, reference) || 1,
    value: value || reference,
    footprint,
    matchKey,
    raw: {},
    description: String(payload.description ?? '').trim(),
    manual: true,
  });
  return line;
}
