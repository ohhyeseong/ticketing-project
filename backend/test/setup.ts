import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true, quiet: true });

const dbName = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/').pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to run e2e tests: DATABASE_URL points to "${dbName}", expected a *_test database`);
}
if (process.env.REDIS_DB !== '15') {
  throw new Error(`Refusing to run e2e tests: REDIS_DB must be 15, got "${process.env.REDIS_DB}"`);
}
