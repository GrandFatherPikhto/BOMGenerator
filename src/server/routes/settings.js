// /api/settings routes (singleton document).
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { getSettings, updateSettings } from '../services/settingsService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getSettings());
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await updateSettings(req.body));
  }),
);

export default router;
