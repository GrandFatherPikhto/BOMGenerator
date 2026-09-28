// Server entry point: connect to MongoDB, seed defaults and start Express.
import 'dotenv/config';

import { createApp } from './app.js';
import { connectDatabase } from './db.js';
import { isAuthEnabled } from './lib/authConfig.js';
import { ensureServiceBoard } from './services/boardService.js';
import { seedDefaults } from './services/categoryService.js';
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

  // Data migrations are deliberately NOT run at startup: a bad run must not be
  // able to damage the data on every restart. Run them explicitly with
  // `npm run migrate` (see scripts/migrate.js, which supports --dry-run).

  // Authentication needs a signing secret; fail fast instead of 401-ing everyone.
  if (isAuthEnabled() && !process.env.SESSION_SECRET) {
    console.error('\nAuthentication is enabled (auth.json has users) but SESSION_SECRET is not set.');
    console.error('Generate one with:');
    console.error(
      "  node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",
    );
    process.exit(1);
  }
  console.log(
    isAuthEnabled()
      ? 'Authentication: enabled (users from auth.json)'
      : 'Authentication: disabled (no users configured)',
  );

  const app = createApp();
  app.listen(port, () => {
    console.log(`BOM API listening on http://127.0.0.1:${port}`);
    console.log(`MongoDB: ${uri}`);
  });
}

main();
