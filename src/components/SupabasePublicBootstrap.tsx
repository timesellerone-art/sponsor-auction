import { readSupabasePublicConfig } from '@/lib/supabase/public-config';

export function SupabasePublicBootstrap() {
  const config = readSupabasePublicConfig();
  if (!config) {
    return null;
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__CLINK_SUPABASE__=${json}`,
      }}
    />
  );
}
