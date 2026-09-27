// /api/boards routes.
import { Router } from 'express';
import multer from 'multer';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  addManualLine,
  createBoard,
  deleteBoard,
  deleteLine,
  getBoard,
  getBoardView,
  listBoards,
  serializeBoard,
  updateBoard,
  updateLine,
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
    });
    res.json({
      board: serializeBoard(result.board),
      summary: result.summary,
    });
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

// Grouped rows with calculated columns and the "Итого" totals.
router.get(
  '/:id/lines',
  asyncHandler(async (req, res) => {
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
