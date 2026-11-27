import { isDemoAccountEmail, mockGetSession } from '@/lib/auth-mock';
import { getSupabaseClient, type SponsorAuctionClient } from '@/lib/supabase';

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 공개 오픈 캠페인·크리에이터 상품 목록/상세는 로그인 여부와 상관없이 라이브 DB를 읽습니다.
 * 데모(Mock) 로그인만 시드 저장소를 사용합니다.
 */
export async function getPublicListingClient(): Promise<SponsorAuctionClient | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    const mock = await mockGetSession();
    if (mock.data) {
      return null;
    }
  } catch {
    // 데모 세션이 없으면 라이브 조회를 이어갑니다.
  }

  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 2000);
    if (isDemoAccountEmail(data.session?.user?.email)) {
      return null;
    }
  } catch {
    // 세션 확인에 실패해도 공개 테이블은 anon 키로 읽을 수 있습니다.
  }

  return supabase;
}

/**
 * 실제 Supabase Auth 세션이 있으면 라이브 DB를 사용합니다.
 * 비회원과 데모(Mock) 로그인은 시드 캠페인이 있는 Mock 저장소를 사용합니다.
 */
export async function getDataClient(): Promise<SponsorAuctionClient | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    const mock = await mockGetSession();
    if (mock.data) {
      return null;
    }
  } catch {
    // 데모 세션 확인에 실패해도 라이브 Auth 여부를 이어서 확인합니다.
  }

  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 2000);
    if (error) {
      console.warn('[SponsorAuction] 데이터 클라이언트 세션 확인 경고', error.message);
    }
    if (!error && data.session?.user) {
      if (isDemoAccountEmail(data.session.user.email)) {
        return null;
      }
      return supabase;
    }
  } catch {
    // Auth API가 응답하지 않으면 Mock 저장소로 조회합니다.
  }

  return null;
}
