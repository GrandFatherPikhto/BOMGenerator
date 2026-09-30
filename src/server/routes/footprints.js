// /api/footprints routes: the "Посадочные места" summary and the grouping flag.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { listFootprints, setFootprintGrouped } from '../services/footprintService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listFootprints());
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const footprint = req.body?.footprint ?? '';
    const grouped = Boolean(req.body?.grouped);
    res.json(await setFootprintGrouped(footprint, grouped));
  }),
);

export default router;
