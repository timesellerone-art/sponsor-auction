import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatBusinessNumber,
  isBusinessVerificationStatus,
} from '@/lib/business-registration';
import type { Database } from '@/types/database';
import type { ProfileItem } from '@/types/admin';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type BaseProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: ProfileItem['role'];
  roles?: ProfileItem['roles'];
  status: ProfileItem['status'];
  createdAt: string;
};

function textField(row: object, ...keys: string[]) {
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

export function adminBusinessFieldsFromRow(row: object): Pick<
  ProfileItem,
  | 'businessRegistrationNumber'
  | 'businessVerificationStatus'
  | 'businessStatusDetail'
  | 'businessReviewNote'
  | 'businessRepresentativeName'
  | 'businessOpenedOn'
  | 'businessCompanyName'
  | 'businessAddress'
  | 'businessContact'
  | 'businessCertificateName'
  | 'hasBusinessCertificate'
  | 'settlementType'
> {
  const statusRaw = textField(row, 'business_verification_status', 'businessVerificationStatus') ?? '';
  const status = isBusinessVerificationStatus(statusRaw) ? statusRaw : 'unregistered';
  const settlementRaw = textField(row, 'settlement_type', 'settlementType');
  const number = textField(row, 'business_registration_number', 'businessRegistrationNumber');
  const certPath = textField(row, 'business_certificate_path', 'businessCertificatePath') ?? '';
  const certName = textField(row, 'business_certificate_name', 'businessCertificateName') ?? '';
  return {
    businessRegistrationNumber: typeof number === 'string' ? formatBusinessNumber(number) : '',
    businessVerificationStatus: status,
    businessStatusDetail: textField(row, 'business_status_detail', 'businessStatusDetail') ?? '',
    businessReviewNote: textField(row, 'business_review_note', 'businessReviewNote') ?? '',
    businessRepresentativeName:
      textField(row, 'business_representative_name', 'businessRepresentativeName') ?? '',
    businessOpenedOn: textField(row, 'business_opened_on', 'businessOpenedOn') ?? '',
    businessCompanyName: textField(row, 'business_company_name', 'businessCompanyName') ?? '',
    businessAddress: textField(row, 'business_address', 'businessAddress') ?? '',
    businessContact: textField(row, 'business_contact', 'businessContact') ?? '',
    businessCertificateName: certName,
    hasBusinessCertificate: Boolean(certPath.trim() || certName.trim()),
    settlementType:
      settlementRaw === 'business' || settlementRaw === 'individual' ? settlementRaw : undefined,
  };
}

async function loadProfileRowsByIds(client: SupabaseClient<Database>, ids: string[]) {
  if (ids.length === 0) {
    return { rows: [] as object[], error: null };
  }
  const rows: object[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const starred = await client.from('profiles').select('*').in('id', chunk);
    if (starred.error) {
      return { rows: [] as object[], error: starred.error };
    }
    rows.push(...((starred.data ?? []) as ProfileRow[]));
  }
  return { rows, error: null };
}

export async function loadAdminBusinessFieldsByUserId(
  client: SupabaseClient<Database>,
  userId: string,
) {
  const loaded = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (loaded.error) {
    return { fields: null, error: loaded.error };
  }
  if (!loaded.data) {
    return { fields: null, error: null };
  }
  return { fields: adminBusinessFieldsFromRow(loaded.data), error: null };
}

export async function attachAdminBusinessFields(
  client: SupabaseClient<Database>,
  profiles: BaseProfile[],
): Promise<ProfileItem[]> {
  const loaded = await loadProfileRowsByIds(
    client,
    profiles.map((profile) => profile.id),
  );
  if (loaded.error) {
    console.warn('[SponsorAuction] 관리자 사업자 정보 조회 실패', loaded.error);
  }
  const businessById = new Map<string, object>();
  for (const row of loaded.rows) {
    const id = textField(row, 'id');
    if (id) {
      businessById.set(id, row);
    }
  }
  return profiles.map((profile) => {
    const extra = businessById.get(profile.id);
    return {
      ...profile,
      phone: profile.phone ?? null,
      ...(extra
        ? adminBusinessFieldsFromRow(extra)
        : {
            businessRegistrationNumber: '',
            businessVerificationStatus: 'unregistered' as const,
            businessStatusDetail: '',
            businessReviewNote: '',
            businessRepresentativeName: '',
            businessOpenedOn: '',
            businessCompanyName: '',
            businessAddress: '',
            businessContact: '',
            businessCertificateName: '',
            hasBusinessCertificate: false,
            settlementType: undefined,
          }),
    };
  });
}
