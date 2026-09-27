// /api/common-purchases routes.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  getCommonPurchases,
  setCommonOverride,
} from '../services/commonPurchaseService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getCommonPurchases(req.query.mode || 'merged'));
  }),
);

// The match key contains control characters, so the client sends it in the body.
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const override = await setCommonOverride(req.body.matchKey, req.body);
    res.json(override);
  }),
);

// Convenience form for simple/encoded keys.
router.put(
  '/:matchKey',
  asyncHandler(async (req, res) => {
    const override = await setCommonOverride(
      decodeURIComponent(req.params.matchKey),
      req.body,
    );
    res.json(override);
  }),
);

export default router;
