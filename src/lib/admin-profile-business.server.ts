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

function asBusinessRow(row: Partial<ProfileRow> | null | undefined): BusinessRow | null {
  const id = row?.id;
  if (!id) {
    return null;
  }
  return {
    id,
    business_registration_number: row.business_registration_number ?? undefined,
    business_verification_status: row.business_verification_status ?? undefined,
    business_status_detail: row.business_status_detail ?? undefined,
    business_review_note: row.business_review_note ?? undefined,
    settlement_type: row.settlement_type ?? undefined,
    business_representative_name: row.business_representative_name ?? undefined,
    business_opened_on: row.business_opened_on ?? undefined,
    business_certificate_path: row.business_certificate_path ?? undefined,
    business_certificate_name: row.business_certificate_name ?? undefined,
    business_company_name: row.business_company_name ?? undefined,
    business_address: row.business_address ?? undefined,
    business_contact: row.business_contact ?? undefined,
  };
}

async function loadBusinessRows(
  client: SupabaseClient<Database>,
  columns: (typeof BUSINESS_SELECTS)[number],
) {
  const pageSize = 1000;
  const rows: BusinessRow[] = [];
  let from = 0;
  while (from < 20_000) {
    const page = await client
      .from('profiles')
      .select(columns as '*')
      .range(from, from + pageSize - 1)
      .returns<Partial<ProfileRow>[]>();
    if (page.error) {
      return { rows: [] as BusinessRow[], error: page.error };
    }
    const chunk = (page.data ?? [])
      .map((row) => asBusinessRow(row))
      .filter((row): row is BusinessRow => row !== null);
    rows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return { rows, error: null };
}

export async function attachAdminBusinessFields(
  client: SupabaseClient<Database>,
  profiles: BaseProfile[],
): Promise<ProfileItem[]> {
  let businessRows: BusinessRow[] = [];
  for (const columns of BUSINESS_SELECTS) {
    const loaded = await loadBusinessRows(client, columns);
    if (!loaded.error) {
      businessRows = loaded.rows;
      break;
    }
  }
  const businessById = new Map(businessRows.map((row) => [row.id, row]));
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
      businessRegistrationNumber: formatBusinessNumber(extra?.business_registration_number ?? ''),
      businessVerificationStatus: status,
      businessStatusDetail: extra?.business_status_detail ?? '',
      businessReviewNote: extra?.business_review_note ?? '',
      businessRepresentativeName: extra?.business_representative_name?.trim() ?? '',
      businessOpenedOn: extra?.business_opened_on?.trim() ?? '',
      businessCompanyName: extra?.business_company_name?.trim() ?? '',
      businessAddress: extra?.business_address?.trim() ?? '',
      businessContact: extra?.business_contact?.trim() ?? '',
      businessCertificateName: extra?.business_certificate_name?.trim() ?? '',
      hasBusinessCertificate: Boolean(extra?.business_certificate_path?.trim()),
      settlementType,
    };
  });
}
