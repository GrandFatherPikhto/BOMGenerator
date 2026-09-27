// Server entry point: connect to MongoDB, seed defaults and start Express.
import 'dotenv/config';

import { createApp } from './app.js';
import { connectDatabase } from './db.js';
import { ensureServiceBoard } from './services/boardService.js';
import { seedDefaults } from './services/categoryService.js';
import { migrateSellersToProducts } from './services/migrationService.js';
import { getSettings } from './services/settingsService.js';

const port = Number(process.env.PORT || 3000);
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bom-generator';

async function main() {
  try {
    await connectDatabase(uri);
  } catch (error) {
    console.error(`\nCannot connect to MongoDB at ${uri}`);
    console.error('Start the service and try again:  sudo systemctl start mongod');
    console.error(`Details: ${error.message}\n`);
    process.exit(1);
  }

  // Make sure a fresh database is usable right away.
  await getSettings();
  await seedDefaults();
  await ensureServiceBoard();

  const migration = await migrateSellersToProducts();
  if (migration.productsCreated || migration.linesUpdated || migration.overridesUpdated) {
    console.log('Sellers migrated to products:', migration);
  }

  const app = createApp();
  app.listen(port, () => {
    console.log(`BOM API listening on http://127.0.0.1:${port}`);
    console.log(`MongoDB: ${uri}`);
  });
}

main();
