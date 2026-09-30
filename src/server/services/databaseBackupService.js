// Whole-database JSON dump / restore used by scripts/dump.js and
// scripts/restore.js.
//
// The dump is a single JSON document:
//
//   { metadata: {...}, collections: { <name>: [ ...documents... ] } }
//
// Documents are serialised with EJSON (from `bson`), so `ObjectId` and `Date`
// survive the round trip and the references between collections (boardId,
// productId, sellerId) stay intact. The file itself is ordinary JSON text.
import { readFileSync } from 'node:fs';

import { EJSON } from 'bson';
import mongoose from 'mongoose';

const FORMAT = 'EJSON';

function readAppVersion() {
  try {
    const url = new URL('../../../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const APP_VERSION = readAppVersion();

/** The native driver handle; throws when the process is not connected. */
function nativeDb() {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('Not connected to MongoDB');
  }
  return database;
}

/**
 * Read every collection into a plain, EJSON-serialisable object.
 * System collections (`system.*`) are skipped.
 */
export async function dumpDatabase() {
  const database = nativeDb();
  const names = (await database.listCollections().toArray())
    .map((info) => info.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  const collections = {};
  for (const name of names) {
    const documents = await database.collection(name).find().toArray();
    collections[name] = EJSON.serialize(documents);
  }

  return {
    metadata: {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      database: database.databaseName,
      collections: names,
    },
    collections,
  };
}

/** Total number of documents in a dump (for progress messages). */
export function countDocuments(dump) {
  return Object.values(dump?.collections ?? {}).reduce(
    (total, documents) => total + (Array.isArray(documents) ? documents.length : 0),
    0,
  );
}

/**
 * Replace the data of every collection present in the dump: each such
 * collection is dropped and re-created from the file. Collections that are not
 * in the dump are left untouched.
 *
 * The model indexes (unique etc.) are re-created by mongoose on the next
 * application start.
 */
export async function restoreDatabase(dump) {
  const database = nativeDb();
  const collections = dump?.collections;
  if (!collections || typeof collections !== 'object') {
    throw new Error('The dump has no "collections" object');
  }

  const summary = { collections: 0, documents: 0 };
  for (const [name, documents] of Object.entries(collections)) {
    const target = database.collection(name);
    try {
      await target.drop();
    } catch (error) {
      // 26 / NamespaceNotFound: the collection does not exist yet, nothing to drop.
      if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') {
        throw error;
      }
    }

    const records = Array.isArray(documents) ? documents : [];
    if (records.length > 0) {
      await target.insertMany(EJSON.deserialize(records));
    }
    summary.collections += 1;
    summary.documents += records.length;
  }
  return summary;
}
