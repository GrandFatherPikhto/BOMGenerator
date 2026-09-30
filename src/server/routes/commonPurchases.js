// /api/common-purchases routes.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  getCommonPurchases,
  setCommonOverride,
  setCommonOverrideBulk,
} from '../services/commonPurchaseService.js';
import {
  contentDisposition,
  exportCommonPurchases,
} from '../services/exportService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getCommonPurchases(req.query.mode || 'merged'));
  }),
);

// Excel/CSV export of the common-purchases sheet in the current mode.
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { filename, contentType, body } = await exportCommonPurchases(
      req.query.mode || 'merged',
      req.query.format || 'xlsx',
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.send(body);
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

// One override applied to every position of a footprint-grouped row. Registered
// before `/:matchKey` so "bulk" is not swallowed by the parameter route.
router.put(
  '/bulk',
  asyncHandler(async (req, res) => {
    const overrides = await setCommonOverrideBulk(
      req.body?.matchKeys,
      req.body?.changes ?? {},
    );
    res.json(overrides);
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
