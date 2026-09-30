// Dump the whole database to one JSON file.
//
// Usage:
//   npm run dump                      # -> ./backups/dump-YYYYMMDD-HHmmss.json
//   npm run dump -- ./my/backup.json  # explicit path
//
// The file is EJSON (see src/server/services/databaseBackupService.js), so it
// can be fed straight back to `npm run restore`.
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import {
  countDocuments,
  dumpDatabase,
} from '../src/server/services/databaseBackupService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';

/** `YYYYMMDD-HHmmss` in local time. */
function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

const explicitPath = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
const outPath = path.resolve(explicitPath || `backups/dump-${timestamp()}.json`);

await connectDatabase(uri);
const dump = await dumpDatabase();

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');

console.log(
  `Dumped ${countDocuments(dump)} documents from ${dump.metadata.collections.length} collections.`,
);
console.log(`Database: ${dump.metadata.database}`);
console.log(`File: ${outPath}`);

await disconnectDatabase();
