// /api/products routes (seller products / offers).
import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import {
  deleteProduct,
  listProductCategories,
  listProducts,
  updateProduct,
} from '../services/productService.js';

const router = Router();

// Declared before "/:id" so "categories" is not treated as an id.
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json(await listProductCategories());
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listProducts({ sellerId: req.query.sellerId }));
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await updateProduct(req.params.id, req.body));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteProduct(req.params.id);
    res.status(204).end();
  }),
);

export default router;
