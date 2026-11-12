import { e2eAdminClient } from '../tests/helpers/e2e-users';

async function main() {
  const admin = e2eAdminClient();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }

  const { data: before, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  const exists = (before ?? []).some((bucket) => bucket.name === 'campaign-covers');
  if (!exists) {
    const created = await admin.storage.createBucket('campaign-covers', {
      public: true,
      fileSizeLimit: '5242880',
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });
    if (created.error) {
      throw created.error;
    }
  }

  const { data: after } = await admin.storage.listBuckets();
  if (!(after ?? []).some((bucket) => bucket.name === 'campaign-covers')) {
    throw new Error('campaign-covers 버킷을 만들지 못했습니다.');
  }
}

void main();
