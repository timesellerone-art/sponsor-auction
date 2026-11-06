import {
  cleanupDemoAccounts,
  cleanupE2EDataRecords,
  cleanupE2EUsers,
  cleanupSupabaseTemp,
  e2eAdminClient,
} from './e2e-users';

export default async function globalTeardown() {
  const admin = e2eAdminClient();
  try {
    await cleanupE2EUsers(admin);
    await cleanupDemoAccounts(admin);
    await cleanupE2EDataRecords(admin);
  } finally {
    await cleanupSupabaseTemp();
  }
}
