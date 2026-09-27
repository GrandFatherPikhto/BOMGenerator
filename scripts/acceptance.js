// Acceptance run: import the real KiCad examples from techdocs/examples through
// the Express API and print the resulting boards, category blocks and totals.
//
// Usage: node scripts/acceptance.js   (uses MONGODB_URI from .env)
import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';

import { createApp } from '../src/server/app.js';
import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import { ensureServiceBoard } from '../src/server/services/boardService.js';
import { seedDefaults } from '../src/server/services/categoryService.js';
import { getSettings } from '../src/server/services/settingsService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';
const examplesDir = path.resolve('techdocs/examples');
const FILES = ['Power-Board-v099.csv', 'HiPiMS-v099.csv', '3CH-AWG-TIA-v103.csv'];

await connectDatabase(uri);
await getSettings();
await seedDefaults();
await ensureServiceBoard();
const app = createApp();

for (const file of FILES) {
  const fullPath = path.join(examplesDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP ${file} (not found at ${fullPath})`);
    continue;
  }
  const buffer = fs.readFileSync(fullPath);
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', file.replace(/\.csv$/, ''))
    .attach('file', buffer, file);
  console.log(`${file}: HTTP ${response.status}`, response.body.summary);
}

const boardsResponse = await request(app).get('/api/boards');
console.log('\nBoards:');
console.table(
  boardsResponse.body.map((board) => ({
    name: board.name,
    sourceFile: board.sourceFile,
    count: board.count,
    lines: board.lineCount,
  })),
);

const powerBoard = boardsResponse.body.find(
  (board) => board.sourceFile === 'Power-Board-v099.csv',
);

if (powerBoard) {
  const view = (await request(app).get(`/api/boards/${powerBoard.id}/lines`)).body;
  console.log('\nCategory blocks (Power-Board-v099):');
  console.log(view.blocks.filter((block) => block.kind === 'category').map((b) => b.name));

  const lines = view.blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line);
  console.log('\nFirst lines:');
  console.table(
    lines.slice(0, 10).map((line) => ({
      reference: line.reference,
      value: line.value,
      footprint: line.footprint.slice(0, 36),
      totalQty: line.totalQty,
      category: line.category,
      subcategory: line.subcategory ?? '',
    })),
  );
  console.log('Board totals:', view.totals);
}

// Seller list import (CSV and Excel with a sheet).
const SELLER_FILES = [
  { file: 'sellers.csv' },
  { file: 'sellers.xlsx', sheet: 'Продавцы' },
];
for (const item of SELLER_FILES) {
  const fullPath = path.join(examplesDir, item.file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP ${item.file} (not found)`);
    continue;
  }
  const buffer = fs.readFileSync(fullPath);
  let req = request(app).post('/api/sellers/import');
  if (item.sheet) {
    req = req.field('sheet', item.sheet);
  }
  const response = await req.attach('file', buffer, item.file);
  console.log(
    `${item.file}: HTTP ${response.status}`,
    response.body.summary,
    `warnings=${response.body.warnings?.length ?? 0}`,
  );
}

console.log('\nDone.');
await disconnectDatabase();
