// "Common purchases": virtual aggregation of every `common` line.
import {
  COMMON_MODES,
  buildAggregationKey,
  collapseWhitespace,
  isGroupedFootprint,
  resolvePurchaseTotals,
} from '../../shared/index.js';
import { badRequest } from '../lib/httpError.js';
import {
  isBlank,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
} from '../lib/validation.js';
import { Board } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';
import { listRuntimeCategories } from './categoryService.js';
import { getGroupedFootprintKeys } from './footprintService.js';
import { classifyLine, groupIntoBlocks, serializeBlocks } from './grouping.js';
import { getSettings } from './settingsService.js';

export { COMMON_MODES };

/**
 * The single value shared by every override, or `{ value: null, mixed: true }`
 * when they differ. An empty override list means "no value, nothing mixed".
 */
function sharedOverrideValue(overrides, pick) {
  if (overrides.length === 0) {
    return { value: null, mixed: false };
  }
  const values = overrides.map((override) => pick(override));
  const first = values[0];
  return values.every((value) => value === first)
    ? { value: first, mixed: false }
    : { value: null, mixed: true };
}

export async function getCommonPurchases(mode = 'merged') {
  if (!COMMON_MODES.includes(mode)) {
    throw badRequest(`mode must be one of ${COMMON_MODES.join(', ')}`);
  }

  const [settings, categories, boards, groupedFootprints] = await Promise.all([
    getSettings(),
    listRuntimeCategories(),
    Board.find().lean(),
    getGroupedFootprintKeys(),
  ]);

  // Only boards that are enabled AND marked "in common purchases" contribute.
  const boardMap = new Map(
    boards
      .filter((board) => board.enabled !== false && board.inCommon !== false)
      .map((board) => [String(board._id), board]),
  );

  // Scope the line scan to the participating boards instead of the whole
  // collection.
  const boardIds = [...boardMap.keys()];
  const lines =
    boardIds.length > 0
      ? await BomLine.find({ common: true, boardId: { $in: boardIds } }).lean()
      : [];

  const keys = [...new Set(lines.map((line) => line.matchKey))];
  const overrides =
    keys.length > 0
      ? await CommonPurchaseOverride.find({ matchKey: { $in: keys } }).lean()
      : [];

  const productIds = [
    ...new Set(
      overrides
        .filter((item) => item.productId)
        .map((item) => String(item.productId)),
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
  const overrideMap = new Map(overrides.map((item) => [item.matchKey, item]));

  // Aggregate by match key; a footprint marked for grouping collapses every
  // value on that footprint into one row. The quantity already accounts for
  // board.count.
  const groups = new Map();
  for (const line of lines) {
    const board = boardMap.get(String(line.boardId));
    if (!board) {
      continue;
    }
    const grouped = isGroupedFootprint(groupedFootprints, line.footprint);
    const key = buildAggregationKey({
      matchKey: line.matchKey,
      footprint: line.footprint,
      grouped,
    });
    let group = groups.get(key);
    if (!group) {
      group = {
        matchKey: line.matchKey,
        grouped,
        footprint: line.footprint ?? '',
        reference: line.reference,
        value: line.value,
        matchKeys: new Set(),
        names: new Set(),
        totalQty: 0,
        byBoard: {},
      };
      groups.set(key, group);
    }
    group.matchKeys.add(line.matchKey);
    const name = collapseWhitespace(line.value ?? '');
    if (name) {
      group.names.add(name);
    }
    const qty = (line.qty ?? 0) * (board.count ?? 1);
    group.totalQty += qty;
    group.byBoard[board.name] = (group.byBoard[board.name] ?? 0) + qty;
  }

  const rows = [];
  for (const group of groups.values()) {
    const matchKeys = [...group.matchKeys].sort();
    const groupOverrides = matchKeys
      .map((key) => overrideMap.get(key))
      .filter((item) => Boolean(item));

    // A grouped row shares one product/shipping/pack override across all its
    // positions; a value is shown only when every position agrees.
    const productInfo = sharedOverrideValue(groupOverrides, (override) =>
      override.productId ? String(override.productId) : null,
    );
    const product = productInfo.value
      ? productMap.get(productInfo.value) ?? null
      : null;
    const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;
    const shippingInfo = sharedOverrideValue(groupOverrides, (override) =>
      override.shippingCost === undefined || override.shippingCost === null
        ? null
        : override.shippingCost,
    );
    const packsInfo = sharedOverrideValue(groupOverrides, (override) =>
      override.packsOverride === undefined || override.packsOverride === null
        ? null
        : override.packsOverride,
    );
    // "Не закупается" only when every position behind the row is flagged.
    const notPurchased =
      groupOverrides.length === matchKeys.length &&
      groupOverrides.every((override) => Boolean(override.notPurchased));

    const { packs, shippingCost, cost } = resolvePurchaseTotals({
      qty: group.totalQty,
      product,
      packsOverride: packsInfo.value,
      shippingOverride: shippingInfo.value,
    });
    const { parsed, display, category, subcategory, sort } = classifyLine(
      { reference: group.reference, value: group.value, footprint: group.footprint },
      categories,
      settings,
    );

    rows.push({
      matchKey: group.matchKey,
      matchKeys,
      grouped: group.grouped,
      footprint: group.footprint,
      reference: group.reference,
      value: display,
      names: [...group.names],
      totalQty: group.totalQty,
      byBoard: mode === 'by_board' ? group.byBoard : undefined,
      productId: product ? String(product._id) : null,
      sellerId: seller ? String(seller._id) : null,
      notPurchased,
      shippingCost,
      shippingOverride: shippingInfo.value,
      packsOverride: packsInfo.value,
      packs,
      cost,
      parsed,
      display,
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

  const boardNames = [
    ...new Set(rows.flatMap((row) => Object.keys(row.byBoard ?? {}))),
  ].sort();

  return { mode, blocks: serializeBlocks(blocks), totals, boardNames };
}

export async function setCommonOverride(matchKey, payload = {}) {
  const key = String(matchKey ?? '').trim();
  if (!key) {
    throw badRequest('matchKey is required');
  }
  let doc = await CommonPurchaseOverride.findOne({ matchKey: key });
  if (!doc) {
    doc = new CommonPurchaseOverride({ matchKey: key });
  }

  if (payload.productId !== undefined) {
    if (!payload.productId) {
      doc.productId = null;
    } else {
      const product = await SellerProduct.findById(payload.productId);
      if (!product) {
        throw badRequest('productId does not exist');
      }
      doc.productId = product._id;
    }
  }

  if (payload.shippingCost !== undefined) {
    if (isBlank(payload.shippingCost)) {
      doc.shippingCost = null;
    } else {
      const { value, error } = parseNonNegativeNumber(
        payload.shippingCost,
        'shippingCost',
      );
      if (error) {
        throw badRequest(error);
      }
      doc.shippingCost = value;
    }
  }

  if (payload.packsOverride !== undefined) {
    if (isBlank(payload.packsOverride)) {
      doc.packsOverride = null;
    } else {
      const { value, error } = parseNonNegativeInteger(
        payload.packsOverride,
        'packsOverride',
      );
      if (error) {
        throw badRequest(error);
      }
      doc.packsOverride = value;
    }
  }

  if (payload.notPurchased !== undefined) {
    doc.notPurchased = Boolean(payload.notPurchased);
  }

  await doc.save();
  return doc;
}

/**
 * Apply one override to several positions at once — used by a footprint-grouped
 * row of the common sheet, which stands for multiple `matchKey`s.
 */
export async function setCommonOverrideBulk(matchKeys, payload = {}) {
  const keys = [
    ...new Set(
      (Array.isArray(matchKeys) ? matchKeys : [])
        .map((key) => String(key ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (keys.length === 0) {
    throw badRequest('matchKeys are required');
  }
  return Promise.all(keys.map((key) => setCommonOverride(key, payload)));
}
