// Shared setup for API integration tests. They run against a real local
// MongoDB using the database from MONGODB_URI_TEST (dropped before each test).
import mongoose from 'mongoose';

import { createApp } from '../../src/server/app.js';
import { ensureServiceBoard } from '../../src/server/services/boardService.js';
import { seedDefaults } from '../../src/server/services/categoryService.js';
import { getSettings } from '../../src/server/services/settingsService.js';

export const TEST_URI =
  process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/bom-generator-test';

export async function connectTestDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 4000 });
  }
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
}

export async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function prepareApp() {
  await resetDb();
  await getSettings();
  await seedDefaults();
  await ensureServiceBoard();
  return createApp();
}

/** Flatten the "line" blocks of a grouped board/common view. */
export function linesOf(body) {
  return body.blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line);
}

export function findLine(body, predicate) {
  return linesOf(body).find(predicate);
}

export function blockNames(body, kind) {
  return body.blocks
    .filter((block) => block.kind === kind)
    .map((block) => block.name);
}

export function serviceBoardId(boards) {
  return boards.find((board) => board.isService)?.id;
}
