// Round trip of the JSON dump: ids, dates and cross-collection references must
// survive `dumpDatabase` -> JSON text -> `restoreDatabase`.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../../src/server/db.js';
import {
  countDocuments,
  dumpDatabase,
  restoreDatabase,
} from '../../src/server/services/databaseBackupService.js';

const BASE_TEST_URI =
  process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/bom-generator-test';
const URI = `${BASE_TEST_URI}-backup-${process.pid}`;

before(async () => {
  await connectDatabase(URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('dump and restore keep ids, dates and references', async () => {
  const db = mongoose.connection.db;
  const boardId = new mongoose.Types.ObjectId();
  const createdAt = new Date('2024-01-02T03:04:05.000Z');

  await db.collection('boards').insertOne({ _id: boardId, name: 'Board A', count: 1 });
  await db.collection('bomlines').insertOne({
    _id: new mongoose.Types.ObjectId(),
    boardId,
    matchKey: 'kept',
    qty: 2,
    createdAt,
  });
  await db
    .collection('sellers')
    .insertOne({ _id: new mongoose.Types.ObjectId(), name: 'Shop' });

  const dump = await dumpDatabase();
  assert.equal(dump.metadata.format, 'EJSON');
  assert.equal(dump.metadata.database, mongoose.connection.name);
  assert.equal(countDocuments(dump), 3);
  assert.ok(dump.metadata.collections.includes('bomlines'));

  // The file on disk is JSON text, so serialise once more before restoring.
  const onDisk = JSON.parse(JSON.stringify(dump));

  // Wipe the data and add a document that must disappear on restore.
  await db.collection('boards').deleteMany({});
  await db.collection('bomlines').deleteMany({});
  await db.collection('sellers').deleteMany({});
  await db.collection('bomlines').insertOne({
    _id: new mongoose.Types.ObjectId(),
    boardId: new mongoose.Types.ObjectId(),
    matchKey: 'junk',
  });

  const summary = await restoreDatabase(onDisk);
  assert.equal(summary.documents, 3);
  assert.equal(summary.collections, 3);

  const line = await db.collection('bomlines').findOne({ matchKey: 'kept' });
  assert.ok(line, 'the kept line is restored');
  assert.equal(String(line.boardId), String(boardId));
  assert.equal(line.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(await db.collection('bomlines').countDocuments(), 1);
});

test('restore rejects a file that is not a dump', async () => {
  await assert.rejects(() => restoreDatabase({}), /collections/);
});

test('the footprint grouping collection survives the round trip', async () => {
  const db = mongoose.connection.db;
  await db.collection('groupedfootprints').deleteMany({});
  await db.collection('groupedfootprints').insertOne({
    _id: new mongoose.Types.ObjectId(),
    footprint: 'r_0603',
  });

  const dump = JSON.parse(JSON.stringify(await dumpDatabase()));
  assert.ok(
    dump.metadata.collections.includes('groupedfootprints'),
    'the dump enumerates the new collection',
  );

  // Wipe it, then restore and check the document comes back.
  await db.collection('groupedfootprints').deleteMany({});
  await restoreDatabase(dump);

  const restored = await db
    .collection('groupedfootprints')
    .findOne({ footprint: 'r_0603' });
  assert.ok(restored, 'the grouped footprint is restored');
});
