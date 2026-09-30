// Restore the whole database from a JSON dump (see scripts/dump.js).
//
// Usage:
//   npm run restore -- ./backups/dump-YYYYMMDD-HHmmss.json          # asks first
//   npm run restore -- ./backups/dump-YYYYMMDD-HHmmss.json --yes    # no prompt
//
// Every collection present in the dump is dropped and re-created from the file,
// so the data of those collections is fully replaced. Wait for the server to
// restart afterwards to rebuild the model indexes.
import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import {
  countDocuments,
  restoreDatabase,
} from '../src/server/services/databaseBackupService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';
const args = process.argv.slice(2);
const confirmed = args.includes('--yes') || args.includes('-y');
const file = args.find((arg) => !arg.startsWith('-'));

if (!file) {
  console.error('Usage: npm run restore -- <dump.json> [--yes]');
  process.exit(1);
}

const dump = JSON.parse(await readFile(file, 'utf8'));
if (!dump || typeof dump !== 'object' || !dump.collections) {
  console.error('The file does not look like a dump produced by "npm run dump".');
  process.exit(1);
}

console.log(`Dump: ${file}`);
console.log(`Created: ${dump.metadata?.createdAt ?? 'unknown'}`);
console.log(`Collections: ${Object.keys(dump.collections).length}`);
console.log(`Documents: ${countDocuments(dump)}`);
console.log(`Target database: ${uri}`);

if (!confirmed) {
  if (!stdin.isTTY) {
    console.error('Refusing to overwrite without --yes (no interactive terminal).');
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    'This REPLACES the data of every collection listed above. Continue? [y/N] ',
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Aborted.');
    process.exit(1);
  }
}

await connectDatabase(uri);
const summary = await restoreDatabase(dump);
console.log(
  `Restored ${summary.documents} documents into ${summary.collections} collections.`,
);
await disconnectDatabase();
