// Migrate sellers to the seller -> products model.
//
// Usage: npm run migrate   (uses MONGODB_URI from .env)
import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../src/server/db.js';
import { migrateSellersToProducts } from '../src/server/services/migrationService.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';

await connectDatabase(uri);
const result = await migrateSellersToProducts();
console.log('Migration result:', result);
await disconnectDatabase();
