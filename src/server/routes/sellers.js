// /api/sellers routes.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  createSeller,
  deleteSeller,
  getSeller,
  listSellers,
  updateSeller,
} from '../services/sellerService.js';

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
