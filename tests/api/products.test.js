// Products (offers) of a seller: CRUD, validation and the reference cleanup
// that happens when a product or a whole seller is deleted.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { CommonPurchaseOverride } from '../../src/server/models/CommonPurchaseOverride.js';
import { BomLine } from '../../src/server/models/BomLine.js';
import {
  connectTestDb,
  createSellerWithProduct,
  disconnectTestDb,
  findLine,
  prepareApp,
  serviceBoardId,
} from './helpers.js';

let app;
before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

async function createSeller(payload) {
  const response = await request(app).post('/api/sellers').send(payload);
  assert.equal(response.status, 201);
  return response.body;
}

async function addManualLine(boardId, payload) {
  const response = await request(app).post(`/api/boards/${boardId}/lines`).send(payload);
  assert.equal(response.status, 201);
  return response.body;
}

test('creates a product under a seller and returns it with the seller data', async () => {
  const seller = await createSeller({ name: 'AliExpress', url: 'https://aliexpress/shop' });

  const response = await request(app)
    .post(`/api/sellers/${seller._id}/products`)
    .send({
      name: 'Resistor 4.7K 0603',
      url: 'https://aliexpress/item/1',
      packQty: 100,
      packPrice: 120,
      shippingCost: 250,
      category: 'Резисторы',
      description: '100 шт в упаковке',
      footprint: '0603',
    });

  assert.equal(response.status, 201);
  const product = response.body;
  assert.equal(product.sellerId, seller._id);
  assert.equal(product.sellerName, 'AliExpress');
  assert.equal(product.sellerUrl, 'https://aliexpress/shop');
  assert.equal(product.name, 'Resistor 4.7K 0603');
  assert.equal(product.url, 'https://aliexpress/item/1');
  assert.equal(product.packQty, 100);
  assert.equal(product.packPrice, 120);
  assert.equal(product.shippingCost, 250);
  assert.equal(product.category, 'Резисторы');
  assert.equal(product.footprint, '0603');
});

test('lists the products of one seller and all products with the seller attached', async () => {
  const { seller: first } = await createSellerWithProduct(
    app,
    { name: 'Shop A', url: 'https://a' },
    { productName: 'A1', packQty: 10, packPrice: 5 },
  );
  await request(app)
    .post(`/api/sellers/${first._id}/products`)
    .send({ name: 'A2', packQty: 1, packPrice: 1 });
  const { seller: second } = await createSellerWithProduct(
    app,
    { name: 'Shop B' },
    { productName: 'B1' },
  );

  const oneSeller = await request(app).get(`/api/sellers/${first._id}/products`);
  assert.equal(oneSeller.status, 200);
  assert.deepEqual(
    oneSeller.body.map((product) => product.name).sort(),
    ['A1', 'A2'],
  );

  const filtered = await request(app).get(`/api/products?sellerId=${second._id}`);
  assert.deepEqual(
    filtered.body.map((product) => product.name),
    ['B1'],
  );

  const all = await request(app).get('/api/products');
  assert.equal(all.body.length, 3);
  const names = new Map(all.body.map((product) => [product.name, product.sellerName]));
  assert.equal(names.get('A1'), 'Shop A');
  assert.equal(names.get('B1'), 'Shop B');
});

test('validates the product payload and the target seller', async () => {
  const seller = await createSeller({ name: 'Shop' });

  const noName = await request(app)
    .post(`/api/sellers/${seller._id}/products`)
    .send({ name: '  ', packQty: 1, packPrice: 0 });
  assert.equal(noName.status, 400);

  const badPacks = await request(app)
    .post(`/api/sellers/${seller._id}/products`)
    .send({ name: 'X', packQty: 0, packPrice: 0 });
  assert.equal(badPacks.status, 400);

  const badPrice = await request(app)
    .post(`/api/sellers/${seller._id}/products`)
    .send({ name: 'X', packQty: 1, packPrice: -1 });
  assert.equal(badPrice.status, 400);

  const unknownSeller = await request(app)
    .post('/api/sellers/000000000000000000000000/products')
    .send({ name: 'X', packQty: 1, packPrice: 0 });
  assert.equal(unknownSeller.status, 404);
});

test('updates a product and keeps the seller data', async () => {
  const { seller, product } = await createSellerWithProduct(
    app,
    { name: 'Shop', url: 'https://shop' },
    { productName: 'Old name', packQty: 1, packPrice: 0 },
  );

  const response = await request(app)
    .put(`/api/products/${product.id}`)
    .send({ name: 'New name', packQty: 50, packPrice: 99, url: 'https://shop/item' });

  assert.equal(response.status, 200);
  assert.equal(response.body.name, 'New name');
  assert.equal(response.body.packQty, 50);
  assert.equal(response.body.packPrice, 99);
  assert.equal(response.body.url, 'https://shop/item');
  assert.equal(response.body.sellerId, seller._id);
  assert.equal(response.body.sellerName, 'Shop');

  const missing = await request(app)
    .put('/api/products/000000000000000000000000')
    .send({ name: 'X' });
  assert.equal(missing.status, 404);
});

test('deleting a product clears the reference in lines and overrides', async () => {
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { productName: 'Part', packQty: 10, packPrice: 7 },
  );

  const boards = (await request(app).get('/api/boards')).body;
  const boardId = serviceBoardId(boards);
  const line = await addManualLine(boardId, {
    value: '1 uF',
    footprint: '0603',
    qty: 15,
  });
  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ productId: product.id });

  await CommonPurchaseOverride.create({ matchKey: 'override-key', productId: product.id });

  const before = await request(app).get(`/api/boards/${boardId}/lines`);
  const beforeLine = findLine(before.body, (row) => row.id === line.id);
  assert.equal(beforeLine.productId, product.id);
  assert.equal(beforeLine.packs, 2);
  assert.equal(beforeLine.cost, 14);

  const removed = await request(app).delete(`/api/products/${product.id}`);
  assert.equal(removed.status, 204);

  const after = await request(app).get(`/api/boards/${boardId}/lines`);
  const afterLine = findLine(after.body, (row) => row.id === line.id);
  assert.equal(afterLine.productId, null);
  assert.equal(afterLine.packs, null);
  assert.equal(afterLine.cost, null);

  const override = await CommonPurchaseOverride.findOne({ matchKey: 'override-key' }).lean();
  assert.equal(override.productId, null);

  // The line itself survives, only the product link is dropped.
  assert.ok(await BomLine.findById(line.id));
});

test('deleting a seller cascades its products and clears the line references', async () => {
  const { seller, product } = await createSellerWithProduct(
    app,
    { name: 'Shop', url: 'https://shop' },
    { productName: 'Part', packQty: 5, packPrice: 3 },
  );

  const boards = (await request(app).get('/api/boards')).body;
  const boardId = serviceBoardId(boards);
  const line = await addManualLine(boardId, { value: '10 uF', footprint: '0805', qty: 20 });
  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ productId: product.id });

  const removed = await request(app).delete(`/api/sellers/${seller._id}`);
  assert.equal(removed.status, 204);

  const products = await request(app).get('/api/products');
  assert.deepEqual(products.body, []);

  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  const cleared = findLine(view.body, (row) => row.id === line.id);
  assert.equal(cleared.productId, null);
  assert.equal(cleared.cost, null);
});

test('a seller can live without a url and keeps its description', async () => {
  const created = await createSeller({ name: 'Cash only' });
  assert.equal(created.url, '');
  assert.equal(created.shippingCost, undefined);

  const updated = await request(app)
    .put(`/api/sellers/${created._id}`)
    .send({ description: 'Только самовывоз' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.description, 'Только самовывоз');
});

test('the product delivery cost fills the row and can be overridden', async () => {
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { productName: 'Part', packQty: 10, packPrice: 7, shippingCost: 30 },
  );

  const boards = (await request(app).get('/api/boards')).body;
  const boardId = serviceBoardId(boards);
  const line = await addManualLine(boardId, { value: '1 uF', footprint: '0603', qty: 15 });
  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ productId: product.id });

  const auto = await request(app).get(`/api/boards/${boardId}/lines`);
  const autoRow = findLine(auto.body, (row) => row.id === line.id);
  assert.equal(autoRow.packs, 2);
  assert.equal(autoRow.shippingOverride, null);
  assert.equal(autoRow.shippingCost, 30); // the product's delivery cost
  assert.equal(autoRow.cost, 2 * 7 + 30);
  assert.equal(auto.body.totals.cost, 44);
  assert.equal(auto.body.totals.shippingCost, 30);

  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ shippingCost: 5 });

  const manual = await request(app).get(`/api/boards/${boardId}/lines`);
  const manualRow = findLine(manual.body, (row) => row.id === line.id);
  assert.equal(manualRow.shippingOverride, 5);
  assert.equal(manualRow.shippingCost, 5);
  assert.equal(manualRow.cost, 2 * 7 + 5);
});
