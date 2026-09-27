// /api/categories routes.
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categoryService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listCategories());
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const category = await createCategory(req.body);
    res.status(201).json(category);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await updateCategory(req.params.id, req.body));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteCategory(req.params.id);
    res.status(204).end();
  }),
);

export default router;
