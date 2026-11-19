export const COMPANY = {
  brand: 'Clink',
  legalName: '하람커넥트',
  ceo: '권경환',
  email: 'help@clinkapp.kr',
  phone: '070-8027-8425',
  phoneHours: '평일 10:00 ~ 17:00 / 점심시간 12:00 ~ 13:00 / 주말·공휴일 휴무',
  address: '충청남도 아산시 번영로217번길 31, 2층 오즈 오피스(모종동)',
  businessNo: '533-06-03737',
  mailOrderNo: '신고 진행중',
  privacyOfficer: '권경환',
  hosting: 'Vercel Inc. / Supabase',
} as const;

export const COMPANY_OPERATOR_LINE =
  `${COMPANY.legalName}(대표 ${COMPANY.ceo}, 사업자등록번호 ${COMPANY.businessNo}, 사업장 소재지 ${COMPANY.address}, 연락처 ${COMPANY.phone}, 이메일 ${COMPANY.email})` as const;
