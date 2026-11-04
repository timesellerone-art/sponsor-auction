import { cleanupE2EUsers } from './e2e-users';

export default async function globalTeardown() {
  await cleanupE2EUsers();
}
