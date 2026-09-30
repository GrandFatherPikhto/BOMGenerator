// Boards, their BOM lines and the computed purchase columns.
import {
  buildMatchKey,
  chooseDisplay,
  collapseWhitespace,
  normalizeFootprint,
  parseQty,
  parseValue,
  resolvePurchaseTotals,
} from '../../shared/index.js';
import { badRequest, conflict, notFound } from '../lib/httpError.js';
import {
  isBlank,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  throwIfErrors,
} from '../lib/validation.js';
import { Board, SERVICE_BOARD_NAME } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';
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

function computeRow(line, board, productMap, sellerMap, categories, settings, common) {
  const { parsed, display, category, subcategory, sort } = classifyLine(
    line,
    categories,
    settings,
  );
  const isCommon = Boolean(line.common);

  // A "Общие" position is purchased on the "Common purchases" sheet: its
  // product, shipping and packages come from the shared override (and the need
  // is summed across all boards), not from this line.
  const override = isCommon ? common.overrideByKey.get(line.matchKey) ?? null : null;
  const effectiveProductId = isCommon
    ? override?.productId ?? null
    : line.productId ?? null;
  const product = effectiveProductId
    ? productMap.get(String(effectiveProductId)) ?? null
    : null;
  const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;

  const totalQty = (line.qty ?? 0) * (board.count ?? 1);
  const purchaseQty = isCommon
    ? common.totalByKey.get(line.matchKey) ?? totalQty
    : totalQty;
  const packsOverride = isCommon
    ? override?.packsOverride ?? null
    : line.packsOverride ?? null;
  const shippingOverride = isCommon
    ? override?.shippingCost ?? null
    : line.shippingCost ?? null;
  const { packs, shippingCost, cost } = resolvePurchaseTotals({
    qty: purchaseQty,
    product,
    packsOverride,
    shippingOverride,
  });

  return {
    id: String(line._id),
    reference: line.reference ?? '',
    qty: line.qty ?? 0,
    value: display,
    valueRaw: line.value ?? '',
    footprint: line.footprint ?? '',
    matchKey: line.matchKey,
    productId: product ? String(product._id) : null,
    sellerId: seller ? String(seller._id) : null,
    common: isCommon,
    // For a "Общие" position the flag belongs to the common sheet: the value
    // comes from the override and is shown read-only on the board.
    notPurchased: isCommon
      ? Boolean(override?.notPurchased)
      : Boolean(line.notPurchased),
    shippingCost,
    shippingOverride,
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
  const [settings, categories, lines, boards] = await Promise.all([
    getSettings(),
    listRuntimeCategories(),
    BomLine.find({ boardId: board._id }).lean(),
    Board.find().lean(),
  ]);

  // A "common" line only matters when this board holds the same match key, so
  // scope the extra queries to those keys instead of scanning the collection.
  const keys = [...new Set(lines.map((line) => line.matchKey))];
  const [commonLines, overrides] = await Promise.all([
    keys.length > 0
      ? BomLine.find({ common: true, matchKey: { $in: keys } }).lean()
      : [],
    keys.length > 0
      ? CommonPurchaseOverride.find({ matchKey: { $in: keys } }).lean()
      : [],
  ]);

  // Only the products (and their sellers) referenced by this board are needed
  // to resolve names and costs.
  const productIds = new Set();
  for (const line of lines) {
    if (line.productId) {
      productIds.add(String(line.productId));
    }
  }
  for (const override of overrides) {
    if (override.productId) {
      productIds.add(String(override.productId));
    }
  }
  const products =
    productIds.size > 0
      ? await SellerProduct.find({ _id: { $in: [...productIds] } }).lean()
      : [];
  const sellerIds = [
    ...new Set(products.map((product) => String(product.sellerId))),
  ];
  const sellers =
    sellerIds.length > 0
      ? await Seller.find({ _id: { $in: sellerIds } }).lean()
      : [];

  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
  const productMap = new Map(products.map((product) => [String(product._id), product]));

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
    computeRow(line, board, productMap, sellerMap, categories, settings, common),
  );
  const blocks = groupIntoBlocks(rows, categories, settings);

  const totals = { cost: 0, shippingCost: 0 };
  for (const row of rows) {
    if (row.common || row.notPurchased) {
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
 * "Все" tab: a summary of every enabled non-service board.
 *
 * Rows are grouped by value + footprint (the line `matchKey`) **and** the chosen
 * source (`productId`): the same component bought from different products shows
 * up as several rows, and `hasMultipleSources` flags a component whose chosen
 * products differ — a hint that the sources are worth unifying to save on
 * delivery. "Общие" lines are left to the common-purchases sheet.
 */
export async function getAllBoardsView() {
  const [settings, categories, boards] = await Promise.all([
    getSettings(),
    listRuntimeCategories(),
    Board.find().lean(),
  ]);

  const boardMap = new Map(
    boards
      .filter((board) => board.enabled !== false && !board.isService)
      .map((board) => [String(board._id), board]),
  );

  // Only enabled non-service boards contribute; scope the (potentially large)
  // line scan to their ids.
  const boardIds = [...boardMap.keys()];
  const lines =
    boardIds.length > 0
      ? await BomLine.find({
          common: { $ne: true },
          boardId: { $in: boardIds },
        }).lean()
      : [];

  const productIds = [
    ...new Set(
      lines.filter((line) => line.productId).map((line) => String(line.productId)),
    ),
  ];
  const products =
    productIds.length > 0
      ? await SellerProduct.find({ _id: { $in: productIds } }).lean()
      : [];
  const sellerIds = [
    ...new Set(products.map((product) => String(product.sellerId))),
  ];
  const sellers =
    sellerIds.length > 0
      ? await Seller.find({ _id: { $in: sellerIds } }).lean()
      : [];

  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const groups = new Map();
  for (const line of lines) {
    const board = boardMap.get(String(line.boardId));
    if (!board) {
      continue;
    }
    const source = line.productId ? String(line.productId) : '';
    const key = `${line.matchKey}\u0000${source}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        matchKey: line.matchKey,
        productId: source || null,
        footprint: line.footprint ?? '',
        reference: line.reference ?? '',
        totalQty: 0,
        byBoard: {},
        boards: new Map(),
        lineIds: [],
        displays: [],
        packsOverrides: new Set(),
        shippingOverrides: new Set(),
        descriptions: new Set(),
        // Flipped to false as soon as one line behind the group is bought.
        notPurchased: true,
      };
      groups.set(key, group);
    }
    const qty = (line.qty ?? 0) * (board.count ?? 1);
    group.totalQty += qty;
    group.byBoard[board.name] = (group.byBoard[board.name] ?? 0) + qty;
    group.boards.set(String(board._id), board.name);
    group.lineIds.push(String(line._id));
    group.displays.push(collapseWhitespace(line.value ?? ''));
    group.packsOverrides.add(
      line.packsOverride === undefined || line.packsOverride === null
        ? ''
        : String(line.packsOverride),
    );
    group.shippingOverrides.add(
      line.shippingCost === undefined || line.shippingCost === null
        ? ''
        : String(line.shippingCost),
    );
    group.descriptions.add(String(line.description ?? ''));
    // The group is "не закупается" only when every line behind it is.
    group.notPurchased = group.notPurchased && Boolean(line.notPurchased);
  }

  // A component (same matchKey) with two or more chosen products is flagged.
  const sourcesByMatchKey = new Map();
  for (const group of groups.values()) {
    if (!group.productId) {
      continue;
    }
    if (!sourcesByMatchKey.has(group.matchKey)) {
      sourcesByMatchKey.set(group.matchKey, new Set());
    }
    sourcesByMatchKey.get(group.matchKey).add(group.productId);
  }

  // The single value shared by every line of the group, or `null` when they differ.
  const sharedValue = (values) => {
    if (values.size !== 1) {
      return { value: null, mixed: values.size > 1 };
    }
    const [only] = values;
    return { value: only === '' ? null : only, mixed: false };
  };

  const rows = [];
  for (const group of groups.values()) {
    const display = chooseDisplay(group.displays) ?? '';
    const { parsed, display: shown, category, subcategory, sort } = classifyLine(
      { reference: group.reference, value: display, footprint: group.footprint },
      categories,
      settings,
    );

    const product = group.productId ? productMap.get(group.productId) ?? null : null;
    const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;

    const packsInfo = sharedValue(group.packsOverrides);
    const shippingInfo = sharedValue(group.shippingOverrides);
    const descriptionInfo = sharedValue(group.descriptions);

    const { packs, shippingCost, cost } = resolvePurchaseTotals({
      qty: group.totalQty,
      product,
      packsOverride: packsInfo.value,
      shippingOverride: shippingInfo.value,
    });

    rows.push({
      matchKey: group.matchKey,
      reference: group.reference,
      value: shown,
      footprint: group.footprint,
      totalQty: group.totalQty,
      byBoard: group.byBoard,
      boards: [...group.boards.entries()].map(([id, name]) => ({ id, name })),
      lineIds: group.lineIds,
      hasMultipleSources:
        Boolean(group.productId) &&
        (sourcesByMatchKey.get(group.matchKey)?.size ?? 0) >= 2,
      productId: group.productId,
      sellerId: seller ? String(seller._id) : null,
      common: false,
      notPurchased: group.notPurchased,
      shippingCost,
      shippingOverride: shippingInfo.value === null ? null : Number(shippingInfo.value),
      packsOverride: packsInfo.value === null ? null : Number(packsInfo.value),
      description: descriptionInfo.value ?? '',
      mixed: {
        packs: packsInfo.mixed,
        shipping: shippingInfo.mixed,
        description: descriptionInfo.mixed,
      },
      packs,
      cost,
      parsed,
      display: shown,
      category,
      subcategory,
      sort,
    });
  }

  const blocks = groupIntoBlocks(rows, categories, settings);
  const totals = { cost: 0, shippingCost: 0 };
  for (const row of rows) {
    if (row.notPurchased) {
      continue;
    }
    if (row.cost !== null) {
      totals.cost += row.cost;
    }
    if (row.shippingCost !== null) {
      totals.shippingCost += row.shippingCost;
    }
  }

  const boardList = [...boardMap.values()]
    .map((board) => ({ id: String(board._id), name: board.name }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { scope: 'all', boards: boardList, blocks: serializeBlocks(blocks), totals };
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

  if (payload.productId !== undefined) {
    if (payload.productId === null || payload.productId === '') {
      line.productId = null;
    } else {
      const product = await SellerProduct.findById(payload.productId);
      if (!product) {
        errors.push('productId does not exist');
      } else {
        line.productId = product._id;
      }
    }
  }

  if (payload.common !== undefined) {
    line.common = Boolean(payload.common);
  }

  if (payload.notPurchased !== undefined) {
    line.notPurchased = Boolean(payload.notPurchased);
  }

  if (payload.shippingCost !== undefined) {
    if (isBlank(payload.shippingCost)) {
      line.shippingCost = null;
    } else {
      const { value, error } = parseNonNegativeNumber(
        payload.shippingCost,
        'shippingCost',
      );
      if (error) {
        errors.push(error);
      } else {
        line.shippingCost = value;
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
    if (isBlank(payload.packsOverride)) {
      line.packsOverride = null;
    } else {
      const { value, error } = parseNonNegativeInteger(
        payload.packsOverride,
        'packsOverride',
      );
      if (error) {
        errors.push(error);
      } else {
        line.packsOverride = value;
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

  throwIfErrors(errors);
  await line.save();
  return line;
}

/**
 * Apply the same changes to several lines — used by the "Все" tab, where one
 * aggregated row stands for every board line of the same component+source.
 */
export async function updateLinesBulk(lineIds, changes = {}) {
  const ids = Array.isArray(lineIds)
    ? [...new Set(lineIds.filter(Boolean).map(String))]
    : [];
  if (ids.length === 0) {
    throw badRequest('lineIds is required');
  }

  const touchesIdentity =
    changes.value !== undefined ||
    changes.footprint !== undefined ||
    changes.qty !== undefined ||
    changes.reference !== undefined;

  // Identity edits recompute the match key per line (and are rejected for the
  // imported rows anyway), so keep the sequential path for them.
  if (touchesIdentity) {
    for (const lineId of ids) {
      await updateLine(lineId, changes);
    }
    return ids.length;
  }

  // Validate once, then apply the same `$set` to every line in one round trip.
  const set = {};
  const errors = [];

  if (changes.productId !== undefined) {
    if (isBlank(changes.productId)) {
      set.productId = null;
    } else {
      const product = await SellerProduct.findById(changes.productId);
      if (!product) {
        errors.push('productId does not exist');
      } else {
        set.productId = product._id;
      }
    }
  }
  if (changes.common !== undefined) {
    set.common = Boolean(changes.common);
  }
  if (changes.notPurchased !== undefined) {
    set.notPurchased = Boolean(changes.notPurchased);
  }
  if (changes.shippingCost !== undefined) {
    if (isBlank(changes.shippingCost)) {
      set.shippingCost = null;
    } else {
      const { value, error } = parseNonNegativeNumber(
        changes.shippingCost,
        'shippingCost',
      );
      if (error) {
        errors.push(error);
      } else {
        set.shippingCost = value;
      }
    }
  }
  if (changes.description !== undefined) {
    const description = String(changes.description ?? '').trim();
    if (description.length > 500) {
      errors.push('description must be at most 500 characters');
    } else {
      set.description = description;
    }
  }
  if (changes.packsOverride !== undefined) {
    if (isBlank(changes.packsOverride)) {
      set.packsOverride = null;
    } else {
      const { value, error } = parseNonNegativeInteger(
        changes.packsOverride,
        'packsOverride',
      );
      if (error) {
        errors.push(error);
      } else {
        set.packsOverride = value;
      }
    }
  }

  throwIfErrors(errors);

  if (Object.keys(set).length === 0) {
    return 0;
  }

  const found = await BomLine.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    throw notFound('Line not found');
  }
  await BomLine.updateMany({ _id: { $in: ids } }, { $set: set });
  return ids.length;
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
