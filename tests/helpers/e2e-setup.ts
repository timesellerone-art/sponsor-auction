import { ensureDemoAccounts } from './e2e-users';

export default async function globalSetup() {
  await ensureDemoAccounts();
}
