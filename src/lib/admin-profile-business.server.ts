import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatBusinessNumber,
  isBusinessVerificationStatus,
} from '@/lib/business-registration';
import type { Database } from '@/types/database';
import type { ProfileItem } from '@/types/admin';

const BUSINESS_SELECTS = [
  'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type, business_representative_name, business_opened_on, business_certificate_path, business_certificate_name, business_company_name, business_address, business_contact',
  'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type, business_representative_name, business_opened_on, business_certificate_path, business_certificate_name',
  'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type',
  'id, business_registration_number, business_verification_status, business_status_detail, business_review_note',
] as const;

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type BusinessRow = Pick<ProfileRow, 'id'> &
  Partial<
    Pick<
      ProfileRow,
      | 'business_registration_number'
      | 'business_verification_status'
      | 'business_status_detail'
      | 'business_review_note'
      | 'settlement_type'
      | 'business_representative_name'
      | 'business_opened_on'
      | 'business_certificate_path'
      | 'business_certificate_name'
      | 'business_company_name'
      | 'business_address'
      | 'business_contact'
    >
  >;

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
  }
  return undefined;
}

function asBusinessRow(row: Partial<ProfileRow> | object | null | undefined): BusinessRow | null {
  const source = row ?? {};
  const id = textField(source, 'id');
  if (!id) {
    return null;
  }
  return {
    id,
    business_registration_number: textField(
      source,
      'business_registration_number',
      'businessRegistrationNumber',
    ),
    business_verification_status: textField(
      source,
      'business_verification_status',
      'businessVerificationStatus',
    ) as ProfileRow['business_verification_status'] | undefined,
    business_status_detail: textField(source, 'business_status_detail', 'businessStatusDetail'),
    business_review_note: textField(source, 'business_review_note', 'businessReviewNote'),
    settlement_type: textField(source, 'settlement_type', 'settlementType') as
      | ProfileRow['settlement_type']
      | undefined,
    business_representative_name: textField(
      source,
      'business_representative_name',
      'businessRepresentativeName',
    ),
    business_opened_on: textField(source, 'business_opened_on', 'businessOpenedOn'),
    business_certificate_path: textField(source, 'business_certificate_path', 'businessCertificatePath'),
    business_certificate_name: textField(source, 'business_certificate_name', 'businessCertificateName'),
    business_company_name: textField(source, 'business_company_name', 'businessCompanyName'),
    business_address: textField(source, 'business_address', 'businessAddress'),
    business_contact: textField(source, 'business_contact', 'businessContact'),
  };
}

async function loadBusinessRowsByIds(client: SupabaseClient<Database>, ids: string[]) {
  if (ids.length === 0) {
    return { rows: [] as BusinessRow[], error: null };
  }
  const rows: BusinessRow[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    let page: { data: Partial<ProfileRow>[] | null; error: { message?: string; code?: string } | null } | null =
      null;
    for (const columns of BUSINESS_SELECTS) {
      const result = await client
        .from('profiles')
        .select(columns as '*')
        .in('id', chunk)
        .returns<Partial<ProfileRow>[]>();
      if (!result.error) {
        page = result;
        break;
      }
      page = result;
    }
    if (page?.error) {
      return { rows: [] as BusinessRow[], error: page.error };
    }
    for (const row of page?.data ?? []) {
      const mapped = asBusinessRow(row);
      if (mapped) {
        rows.push(mapped);
      }
    }
  }
  return { rows, error: null };
}

export async function attachAdminBusinessFields(
  client: SupabaseClient<Database>,
  profiles: BaseProfile[],
): Promise<ProfileItem[]> {
  const loaded = await loadBusinessRowsByIds(
    client,
    profiles.map((profile) => profile.id),
  );
  const businessById = new Map(loaded.rows.map((row) => [row.id, row]));
  return profiles.map((profile) => {
    const extra = businessById.get(profile.id);
    const statusRaw = extra?.business_verification_status ?? '';
    const status = isBusinessVerificationStatus(statusRaw) ? statusRaw : 'unregistered';
    const settlementType =
      extra?.settlement_type === 'business' || extra?.settlement_type === 'individual'
        ? extra.settlement_type
        : undefined;
    return {
      ...profile,
      phone: profile.phone ?? null,
      businessRegistrationNumber:
        extra && typeof extra.business_registration_number === 'string'
          ? formatBusinessNumber(extra.business_registration_number)
          : '',
      businessVerificationStatus: status,
      businessStatusDetail: extra?.business_status_detail ?? '',
      businessReviewNote: extra?.business_review_note ?? '',
      businessRepresentativeName: extra?.business_representative_name ?? '',
      businessOpenedOn: extra?.business_opened_on ?? '',
      businessCompanyName: extra?.business_company_name ?? '',
      businessAddress: extra?.business_address ?? '',
      businessContact: extra?.business_contact ?? '',
      businessCertificateName: extra?.business_certificate_name ?? '',
      hasBusinessCertificate: Boolean(extra?.business_certificate_path?.trim()),
      settlementType,
    };
  });
}
