// CRUD for `ParseCategory` plus the default seed ported from python/config.yaml.
import { validateCategory } from '../../shared/index.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { ParseCategory } from '../models/ParseCategory.js';

const SORT_SPECS = ['value_desc', 'value_asc', 'name'];

// The categories of the original Python project, so a fresh database starts
// useful. `order` matches the order used there (narrow categories first).
export const DEFAULT_CATEGORIES = [
  {
    order: 0,
    name: 'Конденсаторы',
    refMode: 'prefix',
    refPatterns: ['C'],
    sort: 'value_desc',
    subcategories: [
      { name: 'Танталовые', footprintContains: 'Tantalum' },
      { name: 'Электролитические', footprintContains: 'Radial' },
    ],
  },
  { order: 1, name: 'Резисторы', refPatterns: ['R'], sort: 'value_desc' },
  { order: 2, name: 'Индуктивности', refPatterns: ['L'], sort: 'value_desc' },
  { order: 3, name: 'Ферритовые бусины', refPatterns: ['FB'] },
  { order: 4, name: 'Диоды', refPatterns: ['D'] },
  { order: 5, name: 'Транзисторы', refPatterns: ['Q'] },
  { order: 6, name: 'ЦАП', namePatterns: ['AD970'] },
  { order: 7, name: 'Микросхемы', refPatterns: ['U', 'IC'] },
  { order: 8, name: 'Модули DC-DC', refPatterns: ['PS'] },
  { order: 9, name: 'Разъёмы', refPatterns: ['J', 'JP', 'CN'] },
  { order: 10, name: 'Кварцы и резонаторы', refPatterns: ['Y', 'X'] },
  { order: 11, name: 'Предохранители', refPatterns: ['F'] },
];

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeInput(payload = {}) {
  const order = Number(payload.order);
  return {
    order: Number.isFinite(order) ? order : 0,
    name: String(payload.name ?? '').trim(),
    refMode: payload.refMode === 'regex' ? 'regex' : 'prefix',
    refPatterns: toStringArray(payload.refPatterns),
    nameMode: payload.nameMode === 'regex' ? 'regex' : 'prefix',
    namePatterns: toStringArray(payload.namePatterns),
    footprintMode: ['prefix', 'regex', 'contains'].includes(payload.footprintMode)
      ? payload.footprintMode
      : 'prefix',
    footprintPatterns: toStringArray(payload.footprintPatterns),
    caseSensitive: Boolean(payload.caseSensitive),
    sort: SORT_SPECS.includes(payload.sort) ? payload.sort : null,
    subcategories: (payload.subcategories ?? []).map((sub) => ({
      name: String(sub?.name ?? '').trim(),
      footprintContains: String(sub?.footprintContains ?? '').trim(),
    })),
  };
}

function assertValid(category) {
  const errors = [];
  if (!category.name) {
    errors.push('name is required');
  }
  errors.push(...validateCategory(category));
  if (errors.length > 0) {
    throw badRequest(errors.join('; '), errors);
  }
}

/** Insert the default categories when the collection is empty. */
export async function seedDefaults({ reset = false } = {}) {
  if (reset) {
    await ParseCategory.deleteMany({});
  }
  const count = await ParseCategory.estimatedDocumentCount();
  if (count > 0) {
    return { inserted: 0 };
  }
  await ParseCategory.insertMany(DEFAULT_CATEGORIES);
  return { inserted: DEFAULT_CATEGORIES.length };
}

/** Categories in evaluation order, used by the grouping code. */
export async function listRuntimeCategories() {
  return ParseCategory.find().sort({ order: 1, name: 1 }).lean();
}

export async function listCategories() {
  return ParseCategory.find().sort({ order: 1, name: 1 }).lean();
}

export async function createCategory(payload) {
  const category = normalizeInput(payload);
  assertValid(category);
  const doc = new ParseCategory(category);
  await doc.save();
  return doc;
}

export async function updateCategory(id, payload) {
  const doc = await ParseCategory.findById(id);
  if (!doc) {
    throw notFound('Category not found');
  }
  const category = normalizeInput({ ...doc.toObject(), ...payload });
  assertValid(category);
  Object.assign(doc, category);
  await doc.save();
  return doc;
}

export async function deleteCategory(id) {
  const doc = await ParseCategory.findByIdAndDelete(id);
  if (!doc) {
    throw notFound('Category not found');
  }
  return doc;
}
