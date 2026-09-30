// /api/boards routes.
import { Router } from 'express';
import multer from 'multer';

import { asyncHandler } from '../lib/asyncHandler.js';
import { exportBoard } from '../services/exportService.js';
import {
  addManualLine,
  createBoard,
  deleteBoard,
  deleteLine,
  getAllBoardsView,
  getBoard,
  getBoardView,
  listBoards,
  serializeBoard,
  updateBoard,
  updateLine,
  updateLinesBulk,
} from '../services/boardService.js';
import { importCsv } from '../services/importService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

function parseOptionalBool(value) {
  if (value === undefined || value === '') {
    return undefined;
  }
  return ['1', 'true', 'yes', 'on', 'да'].includes(String(value).toLowerCase());
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listBoards());
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const board = await createBoard(req.body);
    res.status(201).json(serializeBoard(board));
  }),
);

// Must be declared before "/:id" so that "import" is not treated as an id.
router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const fileName = req.file ? req.file.originalname : req.body.sourceFile;
    const result = await importCsv({
      buffer: req.file?.buffer,
      fileName,
      name: req.body.name,
      excludeDnp: parseOptionalBool(req.body.excludeDnp),
      excludeFromBom: parseOptionalBool(req.body.excludeFromBom),
      targetBoardId: req.body.targetBoardId,
      renameSourceFile: parseOptionalBool(req.body.renameSourceFile),
    });
    res.json({
      board: serializeBoard(result.board),
      summary: result.summary,
    });
  }),
);

// Bulk update of the lines behind one "Все" row. Declared before "/:id" so that
// "lines" is not treated as a board id.
router.put(
  '/lines',
  asyncHandler(async (req, res) => {
    const updated = await updateLinesBulk(req.body.lineIds, req.body.changes);
    res.json({ updated });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(serializeBoard(await getBoard(req.params.id)));
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(serializeBoard(await updateBoard(req.params.id, req.body)));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteBoard(req.params.id);
    res.status(204).end();
  }),
);

// Grouped rows with calculated columns and the "Итого" totals. The special id
// "all" returns the summary of every enabled board (the "Все" tab).
router.get(
  '/:id/lines',
  asyncHandler(async (req, res) => {
    if (req.params.id === 'all') {
      res.json(await getAllBoardsView());
      return;
    }
    res.json(await getBoardView(req.params.id));
  }),
);

router.post(
  '/:id/lines',
  asyncHandler(async (req, res) => {
    const line = await addManualLine(req.params.id, req.body);
    res.status(201).json({ id: String(line._id) });
  }),
);

// Excel/CSV export of one board's purchase table.
router.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const format = req.query.format || 'xlsx';
    const { filename, contentType, body } = await exportBoard(req.params.id, format);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(body);
  }),
);

router.put(
  '/:id/lines/:lineId',
  asyncHandler(async (req, res) => {
    const line = await updateLine(req.params.lineId, req.body);
    res.json({ id: String(line._id) });
  }),
);

router.delete(
  '/:id/lines/:lineId',
  asyncHandler(async (req, res) => {
    await deleteLine(req.params.lineId);
    res.status(204).end();
  }),
);

export default router;
