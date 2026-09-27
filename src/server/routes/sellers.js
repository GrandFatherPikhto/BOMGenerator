// /api/sellers routes.
import { Router } from 'express';
import multer from 'multer';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  createSeller,
  deleteSeller,
  getSeller,
  listSellers,
  updateSeller,
} from '../services/sellerService.js';
import {
  importSellers,
  listSellerSheets,
} from '../services/sellerImportService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listSellers());
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const seller = await createSeller(req.body);
    res.status(201).json(seller);
  }),
);

// Declared before "/:id" so "import" is not treated as an id.
router.post(
  '/import/sheets',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const result = await listSellerSheets({
      buffer: req.file?.buffer,
      fileName: req.file?.originalname,
    });
    res.json(result);
  }),
);

router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const result = await importSellers({
      buffer: req.file?.buffer,
      fileName: req.file?.originalname,
      sheet: req.body.sheet,
    });
    res.json(result);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getSeller(req.params.id));
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await updateSeller(req.params.id, req.body));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteSeller(req.params.id);
    res.status(204).end();
  }),
);

export default router;
