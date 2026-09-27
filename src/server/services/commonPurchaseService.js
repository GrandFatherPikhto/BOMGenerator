// "Common purchases": virtual aggregation of every `common` line.
import { badRequest } from '../lib/httpError.js';
import { Board } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { listRuntimeCategories } from './categoryService.js';
import { classifyLine, groupIntoBlocks, serializeBlocks } from './grouping.js';
import { getSettings } from './settingsService.js';

export const COMMON_MODES = ['merged', 'by_board'];

export async function getCommonPurchases(mode = 'merged') {
  if (!COMMON_MODES.includes(mode)) {
    throw badRequest(`mode must be one of ${COMMON_MODES.join(', ')}`);
  }

  const [settings, categories, sellers, boards, lines, overrides] = await Promise.all([
    getSettings(),
    listRuntimeCategories(),
    Seller.find().lean(),
    Board.find().lean(),
    BomLine.find({ common: true }).lean(),
    CommonPurchaseOverride.find().lean(),
  ]);

  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
  const boardMap = new Map(boards.map((board) => [String(board._id), board]));
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
    const seller = override.sellerId
      ? sellerMap.get(String(override.sellerId)) ?? null
      : null;
    const shippingCost = override.shippingCost ?? null;
    const packsOverride = override.packsOverride ?? null;
    const packs =
      packsOverride ?? (seller ? Math.ceil(group.totalQty / seller.packQty) : null);
    const cost =
      packs !== null && seller
        ? packs * seller.packPrice + (shippingCost || 0)
        : null;
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
      sellerId: override.sellerId ? String(override.sellerId) : null,
      shippingCost,
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

  if (payload.sellerId !== undefined) {
    if (!payload.sellerId) {
      doc.sellerId = null;
    } else {
      const seller = await Seller.findById(payload.sellerId);
      if (!seller) {
        throw badRequest('sellerId does not exist');
      }
      doc.sellerId = seller._id;
    }
  }

  if (payload.shippingCost !== undefined) {
    if (payload.shippingCost === null || payload.shippingCost === '') {
      doc.shippingCost = null;
    } else {
      const shipping = Number(payload.shippingCost);
      if (!Number.isFinite(shipping) || shipping < 0) {
        throw badRequest('shippingCost must be a number >= 0');
      }
      doc.shippingCost = shipping;
    }
  }

  if (payload.packsOverride !== undefined) {
    if (payload.packsOverride === null || payload.packsOverride === '') {
      doc.packsOverride = null;
    } else {
      const packs = Number(payload.packsOverride);
      if (!Number.isInteger(packs) || packs < 0) {
        throw badRequest('packsOverride must be a non-negative integer');
      }
      doc.packsOverride = packs;
    }
  }

  await doc.save();
  return doc;
}
