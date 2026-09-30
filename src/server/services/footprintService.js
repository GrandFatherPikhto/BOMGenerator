// Footprints ("посадочные места"): the summary list of every footprint used by
// the participating boards and the persisted set of footprints marked for
// footprint-only grouping.
import { collapseWhitespace, normalizeFootprintKey } from '../../shared/index.js';
import { badRequest } from '../lib/httpError.js';
import { Board } from '../models/Board.js';
import { BomLine } from '../models/BomLine.js';
import { GroupedFootprint } from '../models/GroupedFootprint.js';

/** Normalised keys of every footprint marked for grouping. */
export async function getGroupedFootprintKeys() {
  const docs = await GroupedFootprint.find().lean();
  return new Set(docs.map((doc) => doc.footprint));
}

/**
 * Summary of every non-empty footprint across the enabled, non-service boards:
 * how many positions (`matchKey`) and boards use it, the summed need and whether
 * it is currently grouped.
 */
export async function listFootprints() {
  const boards = await Board.find({
    enabled: { $ne: false },
    isService: { $ne: true },
  }).lean();
  const boardMap = new Map(boards.map((board) => [String(board._id), board]));
  const boardIds = [...boardMap.keys()];
  const lines =
    boardIds.length > 0
      ? await BomLine.find({ boardId: { $in: boardIds } }).lean()
      : [];
  const groupedKeys = await getGroupedFootprintKeys();

  const groups = new Map();
  for (const line of lines) {
    const board = boardMap.get(String(line.boardId));
    if (!board) {
      continue;
    }
    const key = normalizeFootprintKey(line.footprint);
    if (!key) {
      // An empty footprint cannot be grouped.
      continue;
    }
    let group = groups.get(key);
    if (!group) {
      group = {
        footprint: line.footprint ?? '',
        positions: new Set(),
        boards: new Set(),
        totalQty: 0,
        names: new Set(),
      };
      groups.set(key, group);
    }
    group.positions.add(line.matchKey);
    group.boards.add(String(board._id));
    group.totalQty += (line.qty ?? 0) * (board.count ?? 1);
    const name = collapseWhitespace(line.value ?? '');
    if (name) {
      group.names.add(name);
    }
  }

  const footprints = [...groups.entries()]
    .map(([key, group]) => ({
      footprint: group.footprint,
      positions: group.positions.size,
      boards: group.boards.size,
      totalQty: group.totalQty,
      names: [...group.names].slice(0, 5),
      grouped: groupedKeys.has(key),
    }))
    .sort((left, right) =>
      left.footprint.localeCompare(right.footprint, undefined, { numeric: true }),
    );

  return {
    footprints,
    groupedCount: footprints.filter((item) => item.grouped).length,
  };
}

/** Turn the footprint checkbox on/off; an empty footprint is rejected. */
export async function setFootprintGrouped(footprint, grouped) {
  const key = normalizeFootprintKey(footprint);
  if (!key) {
    throw badRequest('footprint is required');
  }
  if (grouped) {
    await GroupedFootprint.updateOne(
      { footprint: key },
      { $setOnInsert: { footprint: key } },
      { upsert: true },
    );
    return { footprint: key, grouped: true };
  }
  await GroupedFootprint.deleteOne({ footprint: key });
  return { footprint: key, grouped: false };
}
