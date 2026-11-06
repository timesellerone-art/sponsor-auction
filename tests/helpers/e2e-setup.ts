import { cleanupE2EUsers, ensureDemoAccounts } from './e2e-users';

export default async function globalSetup() {
  await cleanupE2EUsers();
  await ensureDemoAccounts();
}
