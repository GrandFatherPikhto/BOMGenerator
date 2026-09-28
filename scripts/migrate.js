// Migrate sellers to the seller -> products model.
//
// Usage: npm run migrate                 (writes; uses MONGODB_URI from .env)
//        npm run migrate -- --dry-run    (only reports what would change)
//
// The migration is deliberately NOT part of the server startup: a bad run must
// never be able to touch the data on every restart.
import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import { migrateSellersToProducts } from '../src/server/services/migrationService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';
const dryRun = process.argv.includes('--dry-run');

await connectDatabase(uri);
console.log(`Sellers -> products migration (${dryRun ? 'dry run' : 'write'}) on ${uri}`);
const result = await migrateSellersToProducts({ dryRun });
console.log('Migration result:', result);
await disconnectDatabase();
