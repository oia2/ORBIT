import { closeE2eDatabase } from './fixtures/database';

export default async function globalTeardown(): Promise<void> {
  await closeE2eDatabase();
}
