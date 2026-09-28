// Migration of the old sellers (with packQty/packPrice) to seller + product.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';

import { migrateSellersToProducts } from '../../src/server/services/migrationService.js';
import { Board } from '../../src/server/models/Board.js';
import { BomLine } from '../../src/server/models/BomLine.js';
import { Seller } from '../../src/server/models/Seller.js';
import { SellerProduct } from '../../src/server/models/SellerProduct.js';
import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  await prepareApp();
});

test('migration turns a legacy seller into a product and repoints lines', async () => {
  // Simulate legacy documents (fields no longer in the schemas) via the driver.
  const insert = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({
      name: 'Legacy shop',
      url: 'https://legacy/1',
      packQty: 100,
      packPrice: 50,
      shippingCost: 350,
      category: 'Cat',
      description: 'Desc',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const sellerId = insert.insertedId;

  const board = await Board.create({ name: 'B', count: 1 });
  const lineInsert = await mongoose.connection
    .collection(BomLine.collection.name)
    .insertOne({
      boardId: board._id,
      reference: 'C1',
      qty: 1,
      value: '1 uF',
      footprint: 'FP',
      matchKey: 'k1',
      sellerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const lineId = lineInsert.insertedId;

  const result = await migrateSellersToProducts();
  assert.equal(result.productsCreated, 1);
  assert.equal(result.linesUpdated, 1);

  const product = await SellerProduct.findOne({ sellerId }).lean();
  assert.ok(product);
  assert.equal(product.name, 'Legacy shop');
  assert.equal(product.url, 'https://legacy/1');
  assert.equal(product.packQty, 100);
  assert.equal(product.packPrice, 50);
  assert.equal(product.shippingCost, 350);

  const updated = await BomLine.findById(lineId).lean();
  assert.equal(String(updated.productId), String(product._id));
  assert.equal(updated.sellerId, undefined);

  // The legacy packaging fields moved to the product and left the seller.
  const migratedSeller = await Seller.findById(sellerId).lean();
  assert.equal(migratedSeller.packQty, undefined);
  assert.equal(migratedSeller.packPrice, undefined);
  assert.equal(migratedSeller.shippingCost, undefined);
  assert.equal(migratedSeller.category, undefined);

  // Re-running the migration changes nothing.
  const again = await migrateSellersToProducts();
  assert.equal(again.productsCreated, 0);
  assert.equal(again.linesUpdated, 0);
});

test('migration backfills the delivery cost into an existing product', async () => {
  const insert = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({
      name: 'Legacy shop',
      url: '',
      shippingCost: 350,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const sellerId = insert.insertedId;

  // A product left behind by an earlier run, before the cost moved here.
  await SellerProduct.create({ sellerId, name: 'Legacy shop', packQty: 1, packPrice: 0 });

  const result = await migrateSellersToProducts();
  assert.equal(result.productsCreated, 0);

  const product = await SellerProduct.findOne({ sellerId }).lean();
  assert.equal(product.shippingCost, 350);

  // The value is not written twice on the next run.
  await migrateSellersToProducts();
  const again = await SellerProduct.findOne({ sellerId }).lean();
  assert.equal(again.shippingCost, 350);
});

test('migration keeps a delivery cost already set on the product', async () => {
  const insert = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({
      name: 'Legacy shop',
      url: '',
      shippingCost: 350,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const sellerId = insert.insertedId;

  // The product already knows its own delivery cost: it must win.
  await SellerProduct.create({
    sellerId,
    name: 'Legacy shop',
    packQty: 1,
    packPrice: 0,
    shippingCost: 5,
  });

  await migrateSellersToProducts();

  const product = await SellerProduct.findOne({ sellerId }).lean();
  assert.equal(product.shippingCost, 5);

  // The moved value leaves the seller, the used one is not resurrected.
  const seller = await Seller.findById(sellerId).lean();
  assert.equal(seller.shippingCost, undefined);
});

test('does nothing at all when no legacy fields are left', async () => {
  const result = await migrateSellersToProducts();
  assert.equal(result.skipped, true);
  assert.equal(result.linesUpdated, 0);
  assert.equal(result.overridesUpdated, 0);
});

test('a line without the legacy sellerId keeps its chosen product', async () => {
  const sellerInsert = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({ name: 'Legacy shop', packQty: 10, packPrice: 5, createdAt: new Date(), updatedAt: new Date() });
  const sellerId = sellerInsert.insertedId;

  const board = await Board.create({ name: 'B', count: 1 });
  const chosen = await SellerProduct.create({
    sellerId,
    name: 'Chosen product',
    packQty: 1,
    packPrice: 1,
  });
  // A current-style line: a product is already chosen and there is no legacy
  // `sellerId`, so the migration must not touch it.
  const lineInsert = await mongoose.connection
    .collection(BomLine.collection.name)
    .insertOne({
      boardId: board._id,
      reference: 'R1',
      qty: 1,
      value: '1k',
      footprint: 'FP',
      matchKey: 'k-keep',
      productId: chosen._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  await migrateSellersToProducts();

  const line = await BomLine.findById(lineInsert.insertedId).lean();
  assert.equal(String(line.productId), String(chosen._id));
});

test('a re-run keeps every chosen product', async () => {
  const first = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({ name: 'Shop A', packQty: 1, packPrice: 1, createdAt: new Date(), updatedAt: new Date() });
  const second = await mongoose.connection
    .collection(Seller.collection.name)
    .insertOne({ name: 'Shop B', packQty: 1, packPrice: 1, createdAt: new Date(), updatedAt: new Date() });

  const board = await Board.create({ name: 'B', count: 1 });
  await mongoose.connection.collection(BomLine.collection.name).insertMany([
    { boardId: board._id, matchKey: 'ka', sellerId: first.insertedId, createdAt: new Date(), updatedAt: new Date() },
    { boardId: board._id, matchKey: 'kb', sellerId: second.insertedId, createdAt: new Date(), updatedAt: new Date() },
  ]);

  await migrateSellersToProducts();
  const before = await BomLine.find({}).sort({ matchKey: 1 }).lean();
  assert.equal(before.length, 2);
  // The two rows must end up on two different products.
  assert.notEqual(String(before[0].productId), String(before[1].productId));

  await migrateSellersToProducts();
  const after = await BomLine.find({}).sort({ matchKey: 1 }).lean();
  assert.deepEqual(
    after.map((line) => String(line.productId)),
    before.map((line) => String(line.productId)),
    'a re-run must not change the chosen products',
  );
});
