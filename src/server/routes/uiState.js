// /api/ui-state routes: the persisted UI state ("working context") of the
// current user. Kept separate from /api/settings so the whole-document settings
// save can never clobber it.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { currentUserId } from '../lib/currentUser.js';
import { getUiState, mergeUiState } from '../services/uiStateService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getUiState(currentUserId(req)));
  }),
);

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const sections = req.body?.sections ?? {};
    res.json(await mergeUiState(currentUserId(req), sections));
  }),
);

export default router;
