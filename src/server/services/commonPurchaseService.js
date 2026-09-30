// "Common purchases": virtual aggregation of every `common` line.
import { COMMON_MODES, resolvePurchaseTotals } from '../../shared/index.js';
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
import { classifyLine, groupIntoBlocks, serializeBlocks } from './grouping.js';
import { getSettings } from './settingsService.js';

export { COMMON_MODES };

export async function getCommonPurchases(mode = 'merged') {
  if (!COMMON_MODES.includes(mode)) {
    throw badRequest(`mode must be one of ${COMMON_MODES.join(', ')}`);
  }

  const [settings, categories, boards] = await Promise.all([
    getSettings(),
    listRuntimeCategories(),
    Board.find().lean(),
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

  // Aggregate by match key; the quantity already accounts for board.count.
  const groups = new Map();
  for (const line of lines) {
    const board = boardMap.get(String(line.boardId));
    if (!board) {
      continue;
    }
    const qty = (line.qty ?? 0) * (board.count ?? 1);
    let group = groups.get(line.matchKey);
    if (!group) {
      group = {
        matchKey: line.matchKey,
        reference: line.reference,
        value: line.value,
        footprint: line.footprint,
        totalQty: 0,
        byBoard: {},
      };
      groups.set(line.matchKey, group);
    }
    group.totalQty += qty;
    group.byBoard[board.name] = (group.byBoard[board.name] ?? 0) + qty;
  }

  const rows = [];
  for (const group of groups.values()) {
    const override = overrideMap.get(group.matchKey) ?? {};
    const product = override.productId
      ? productMap.get(String(override.productId)) ?? null
      : null;
    const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;
    const shippingOverride = override.shippingCost ?? null;
    const packsOverride = override.packsOverride ?? null;
    const { packs, shippingCost, cost } = resolvePurchaseTotals({
      qty: group.totalQty,
      product,
      packsOverride,
      shippingOverride,
    });
    const { parsed, display, category, subcategory, sort } = classifyLine(
      { reference: group.reference, value: group.value, footprint: group.footprint },
      categories,
      settings,
    );

    rows.push({
      matchKey: group.matchKey,
      reference: group.reference,
      value: display,
      footprint: group.footprint,
      totalQty: group.totalQty,
      byBoard: mode === 'by_board' ? group.byBoard : undefined,
      productId: product ? String(product._id) : null,
      sellerId: seller ? String(seller._id) : null,
      notPurchased: Boolean(override.notPurchased),
      shippingCost,
      shippingOverride,
      packsOverride,
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
