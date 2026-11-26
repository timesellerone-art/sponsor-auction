import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function timeslotWriter() {
  return createAdminClient() ?? (await createServerClient());
}

export function timeslotIdFromParam(id: string) {
  try {
    return decodeURIComponent(id.trim());
  } catch {
    return id.trim();
  }
}
