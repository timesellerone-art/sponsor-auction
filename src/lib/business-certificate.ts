export const BUSINESS_CERTIFICATE_BUCKET = 'business-certificates';
export const BUSINESS_CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;
export const BUSINESS_CERTIFICATE_SIGNED_TTL_SEC = 120;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function validateBusinessCertificateFile(file: File) {
  const name = file.name || '';
  const type = file.type || '';
  if (!ALLOWED_TYPES.has(type) && !/\.(jpe?g|png|webp|pdf)$/i.test(name)) {
    return 'JPG, PNG, WEBP 또는 PDF 파일만 올릴 수 있습니다.';
  }
  if (file.size > BUSINESS_CERTIFICATE_MAX_BYTES) {
    return '사업자등록증 사본은 10MB 이하로 올려 주세요.';
  }
  return null;
}

export function sanitizeCertificateFileName(name: string) {
  const base = name.replace(/[/\\]/g, '').replace(/[^\w.\-가-힣]+/g, '_').slice(0, 80);
  return base || 'certificate';
}

export function certificateStoragePath(userId: string, fileName: string) {
  const sanitized = sanitizeCertificateFileName(fileName);
  const extMatch = sanitized.match(/(\.(jpe?g|png|webp|pdf))$/i);
  const ext = extMatch?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? '';
  const stem = sanitized.replace(/(\.(jpe?g|png|webp|pdf))$/i, '') || 'certificate';
  return `${userId}/${Date.now()}-${stem}${ext}`;
}

export function allowsBusinessCertificateUpload(input: {
  status?: string | null;
  ntsLabel?: string | null;
  mismatch?: boolean;
}) {
  if (input.mismatch) {
    return false;
  }
  const label = input.ntsLabel ?? '';
  if (label === '불일치' || label === '휴업자' || label === '폐업자' || label === '미등록') {
    return false;
  }
  if (input.status === 'closed') {
    return false;
  }
  return label === '계속사업자' || input.status === 'review_required' || input.status === 'verified';
}

export function businessCertificateUploadBlockReason(input: {
  status?: string | null;
  ntsLabel?: string | null;
  mismatch?: boolean;
  detail?: string | null;
}) {
  if (allowsBusinessCertificateUpload(input)) {
    return null;
  }
  if (input.status === 'closed' || input.ntsLabel === '휴업자' || input.ntsLabel === '폐업자') {
    return '휴폐업 상태에서는 사업자등록증을 올릴 수 없습니다.';
  }
  if (input.mismatch || input.ntsLabel === '불일치' || /일치하지/.test(input.detail ?? '')) {
    return '국세청 정보가 일치하지 않아 사업자등록증을 올릴 수 없습니다.';
  }
  return '국세청 진위확인이 정상인 경우에만 사업자등록증을 올릴 수 있습니다.';
}
