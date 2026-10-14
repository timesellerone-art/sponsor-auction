declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    SUPABASE_KEY?: string;
    SUPABASE_SERVICE_KEY?: string;
    SERVICE_ROLE_KEY?: string;
    SUPABASE_SERVICE_ROLE?: string;
    NEXT_PUBLIC_TOSS_CLIENT_KEY?: string;
    TOSS_SECRET_KEY?: string;
  }
}
