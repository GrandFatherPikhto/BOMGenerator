// Seed the database with the default categories/settings/service board.
//
// Usage:
//   npm run seed            # insert defaults when empty
//   npm run seed -- --reset # wipe and re-insert the default categories
import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import { ensureServiceBoard } from '../src/server/services/boardService.js';
import { seedDefaults } from '../src/server/services/categoryService.js';
import { getSettings } from '../src/server/services/settingsService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';
const reset = process.argv.includes('--reset');

const connection = await connectDatabase(uri);
await getSettings();
const result = await seedDefaults({ reset });
await ensureServiceBoard();
console.log(
  `Seeded categories: inserted ${result.inserted}${reset ? ' (after reset)' : ''}`,
);
await disconnectDatabase();
void connection;
