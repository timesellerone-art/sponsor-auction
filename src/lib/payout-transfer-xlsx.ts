import { downloadBytes } from '@/lib/admin-csv';
import { DELETED_CAMPAIGN_LABEL, enrichPayoutAmounts } from '@/lib/admin-integrity';
import { floorToTenWon } from '@/lib/fees';
import { calculateCreatorPayout } from '@/lib/payments/payout';
import type { PayoutItem } from '@/types/admin';

export const TRANSFER_XLSX_HEADERS = [
  '입금은행',
  '계좌번호',
  '이체금액(원)',
  '받는분통장표시',
  '내통장표시',
] as const;

export const TRANSFER_RECIPIENT_LABEL = '스폰서옥션';
export const TRANSFER_XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type TransferSkipReason =
  | 'paid'
  | 'cancelled'
  | 'missing_bank'
  | 'missing_account'
  | 'orphan'
  | 'zero_amount';

export type TransferSkip = {
  id: string;
  reason: TransferSkipReason;
  message: string;
};

export type PayoutTransferRow = {
  bankName: string;
  accountNumber: string;
  amount: number;
  recipientLabel: string;
  selfLabel: string;
  sourceId: string;
};

const BANK_ALIASES: Array<[RegExp, string]> = [
  [/카카오/, '카카오뱅크'],
  [/토스/, '토스뱅크'],
  [/케이\s*뱅크|k뱅크/i, '케이뱅크'],
  [/농협|nh/i, '농협은행'],
  [/기업|ibk/i, '기업은행'],
  [/신한/, '신한은행'],
  [/국민|kb/i, '국민은행'],
  [/우리/, '우리은행'],
  [/하나/, '하나은행'],
  [/우체국/, '우체국'],
  [/새마을/, '새마을금고'],
  [/신협/, '신협'],
  [/수협/, '수협은행'],
  [/부산/, '부산은행'],
  [/대구/, '대구은행'],
  [/경남/, '경남은행'],
  [/광주/, '광주은행'],
  [/전북/, '전북은행'],
  [/제주/, '제주은행'],
  [/sc|표준/i, 'SC제일은행'],
  [/씨티|citi/i, '씨티은행'],
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  bytes[2] = (value >>> 16) & 0xff;
  bytes[3] = (value >>> 24) & 0xff;
  return bytes;
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function buildStoreZip(files: Array<{ name: string; data: Uint8Array }>) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.byteLength),
      u32(file.data.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      nameBytes,
      file.data,
    ]);
    const central = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.byteLength),
      u32(file.data.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.byteLength;
  }

  const centralDir = concatBytes(centrals);
  const eocd = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.byteLength),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...locals, centralDir, eocd]);
}

export function readStoreZip(bytes: Uint8Array) {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length && readU32(bytes, offset) === 0x04034b50) {
    const method = readU16(bytes, offset + 8);
    const compressed = readU32(bytes, offset + 18);
    const nameLength = readU16(bytes, offset + 26);
    const extraLength = readU16(bytes, offset + 28);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressed;
    if (method !== 0) {
      throw new Error(`압축된 xlsx 항목은 지원하지 않습니다: ${name}`);
    }
    files.set(name, bytes.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  return files;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xmlUnescape(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function colLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function truncatePassbook(value: string) {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.slice(0, 20);
}

export function digitsOnlyAccount(raw: string) {
  return raw.replace(/\D/g, '');
}

function normalizeBankName(raw: string) {
  const label = raw.trim().replace(/\s+/g, '');
  if (!label) {
    return '';
  }
  for (const [pattern, name] of BANK_ALIASES) {
    if (pattern.test(label)) {
      return name;
    }
  }
  return /은행|뱅크|금고|신협|우체국$/.test(label) ? label : `${label}은행`;
}

export function parseBankAccountField(raw: string | null | undefined) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const accountNumber = digitsOnlyAccount(trimmed);
  const bankRaw = trimmed.replace(/[0-9\-./()\s]+/g, ' ').trim();
  const bankName = normalizeBankName(bankRaw);
  if (!bankName && accountNumber.length < 6) {
    return null;
  }
  return { bankName, accountNumber };
}

export function transferPayoutAmount(item: PayoutItem) {
  const enriched = enrichPayoutAmounts(item);
  const fromNet = enriched.netPayoutAmount;
  if (typeof fromNet === 'number' && Number.isFinite(fromNet) && fromNet > 0) {
    return floorToTenWon(fromNet);
  }
  const bidAmount =
    enriched.bidAmount && enriched.bidAmount > 0
      ? enriched.bidAmount
      : 0;
  return floorToTenWon(calculateCreatorPayout(bidAmount || item.amount));
}

function skip(id: string, reason: TransferSkipReason, message: string): TransferSkip {
  return { id, reason, message };
}

function payoutStatus(item: PayoutItem) {
  return String(item.status ?? '')
    .trim()
    .toLowerCase();
}

export function isTransferPendingStatus(status: string | null | undefined) {
  const value = String(status ?? '')
    .trim()
    .toLowerCase();
  return value === 'pending' || value === 'pending_payout';
}

export function collectPayoutTransferRows(payouts: PayoutItem[]) {
  const rows: PayoutTransferRow[] = [];
  const skipped: TransferSkip[] = [];

  for (const item of payouts) {
    const status = payoutStatus(item);
    if (status === 'paid') {
      skipped.push(skip(item.id, 'paid', '지급 완료 건은 대량이체 대상이 아닙니다.'));
      continue;
    }
    if (status === 'cancelled' || status === 'canceled' || status === 'refunded') {
      skipped.push(skip(item.id, 'cancelled', '취소 건은 대량이체 대상이 아닙니다.'));
      continue;
    }
    if (!isTransferPendingStatus(status)) {
      skipped.push(skip(item.id, 'cancelled', '지급 대기가 아닌 건은 제외합니다.'));
      continue;
    }
    const campaignId = (item.auctionId ?? '').trim();
    if (!campaignId || (item.auctionTitle || '').trim() === DELETED_CAMPAIGN_LABEL) {
      skipped.push(skip(item.id, 'orphan', '캠페인 식별자가 없는 고아 정산은 제외합니다.'));
      continue;
    }

    const parsed = parseBankAccountField(item.bankAccount);
    if (!parsed?.bankName) {
      skipped.push(skip(item.id, 'missing_bank', '입금은행이 없어 제외합니다.'));
      continue;
    }
    if (!parsed.accountNumber || parsed.accountNumber.length < 6) {
      skipped.push(skip(item.id, 'missing_account', '계좌번호가 없어 제외합니다.'));
      continue;
    }

    const amount = transferPayoutAmount(item);
    if (amount <= 0) {
      skipped.push(skip(item.id, 'zero_amount', '이체금액이 0원이라 제외합니다.'));
      continue;
    }

    rows.push({
      bankName: parsed.bankName,
      accountNumber: parsed.accountNumber,
      amount,
      recipientLabel: TRANSFER_RECIPIENT_LABEL,
      selfLabel: truncatePassbook(item.creatorName || item.auctionTitle || item.id),
      sourceId: item.id,
    });
  }

  return { rows, skipped };
}

function sharedStringCell(ref: string, index: number, textStyle = false) {
  const style = textStyle ? ' s="1"' : '';
  return `<c r="${ref}" t="s"${style}><v>${index}</v></c>`;
}

function numberCell(ref: string, value: number) {
  return `<c r="${ref}" t="n"><v>${Math.trunc(value)}</v></c>`;
}

function internSharedString(table: string[], index: Map<string, number>, value: string) {
  const existing = index.get(value);
  if (existing != null) {
    return existing;
  }
  const next = table.length;
  index.set(value, next);
  table.push(value);
  return next;
}

function worksheetAndSharedStrings(rows: PayoutTransferRow[]) {
  const table: string[] = [];
  const index = new Map<string, number>();
  const intern = (value: string) => internSharedString(table, index, value);
  let refs = 0;

  const header = TRANSFER_XLSX_HEADERS.map((title, col) => {
    refs += 1;
    return sharedStringCell(`${colLetter(col)}1`, intern(title));
  }).join('');

  const body = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      refs += 4;
      return `<row r="${excelRow}">${sharedStringCell(`A${excelRow}`, intern(row.bankName))}${sharedStringCell(`B${excelRow}`, intern(row.accountNumber), true)}${numberCell(`C${excelRow}`, row.amount)}${sharedStringCell(`D${excelRow}`, intern(row.recipientLabel))}${sharedStringCell(`E${excelRow}`, intern(row.selfLabel))}</row>`;
    })
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">${header}</row>
    ${body}
  </sheetData>
</worksheet>`;

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${refs}" uniqueCount="${table.length}">
${table.map((value) => `  <si><t xml:space="preserve">${xmlEscape(value)}</t></si>`).join('\n')}
</sst>`;

  return { sheet, sharedStrings };
}

function xlsxParts(sheet: string, sharedStrings: string) {
  return [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="대량이체" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
    },
    {
      name: 'xl/styles.xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="@"/>
  </numFmts>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`),
    },
    {
      name: 'xl/sharedStrings.xml',
      data: encoder.encode(sharedStrings),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: encoder.encode(sheet),
    },
  ];
}

export function buildPayoutTransferXlsx(payouts: PayoutItem[]) {
  const collected = collectPayoutTransferRows(payouts);
  const parts = worksheetAndSharedStrings(collected.rows);
  const bytes = buildStoreZip(xlsxParts(parts.sheet, parts.sharedStrings));
  return { ...collected, bytes };
}

function parseSharedStrings(xml: string) {
  const values: string[] = [];
  const pattern = /<si>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match) {
    values.push(xmlUnescape(match[1]));
    match = pattern.exec(xml);
  }
  return values;
}

export function parsePayoutTransferXlsx(bytes: Uint8Array) {
  const files = readStoreZip(bytes);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  if (!sheet) {
    throw new Error('xlsx 시트를 찾지 못했습니다.');
  }
  const xml = decoder.decode(sheet);
  if (/=SUM|=sum/i.test(xml) || /<f[ >]/.test(xml)) {
    throw new Error('엑셀에 계산식이 포함되어 있습니다.');
  }

  const sharedStringsXml = decoder.decode(files.get('xl/sharedStrings.xml') ?? new Uint8Array());
  const shared = parseSharedStrings(sharedStringsXml);

  const cells = new Map<string, string>();
  const cellPattern = /<c r="([A-E])(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let match: RegExpExecArray | null = cellPattern.exec(xml);
  while (match) {
    const ref = `${match[1]}${match[2]}`;
    const attrs = match[3] ?? '';
    const inner = match[4];
    const number = inner.match(/<v>([\s\S]*?)<\/v>/);
    const inline = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    if (/\bt="s"/.test(attrs) && number) {
      cells.set(ref, shared[Number(number[1].trim())] ?? '');
    } else if (/\bt="n"/.test(attrs) && number) {
      cells.set(ref, number[1].trim());
    } else if (inline) {
      cells.set(ref, xmlUnescape(inline[1]));
    } else if (number) {
      cells.set(ref, number[1].trim());
    }
    match = cellPattern.exec(xml);
  }

  const headers = TRANSFER_XLSX_HEADERS.map((_, index) => cells.get(`${colLetter(index)}1`) ?? '');
  const rows: PayoutTransferRow[] = [];
  let excelRow = 2;
  while (cells.has(`A${excelRow}`) || cells.has(`B${excelRow}`) || cells.has(`C${excelRow}`)) {
    rows.push({
      bankName: cells.get(`A${excelRow}`) ?? '',
      accountNumber: cells.get(`B${excelRow}`) ?? '',
      amount: Number(cells.get(`C${excelRow}`) ?? '0'),
      recipientLabel: cells.get(`D${excelRow}`) ?? '',
      selfLabel: cells.get(`E${excelRow}`) ?? '',
      sourceId: '',
    });
    excelRow += 1;
  }

  const styles = decoder.decode(files.get('xl/styles.xml') ?? new Uint8Array());
  return { headers, rows, xml, styles, sharedStrings: sharedStringsXml };
}

export function downloadPayoutTransferXlsx(payouts: PayoutItem[]) {
  const built = buildPayoutTransferXlsx(payouts);
  const filename = `payout-transfer-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (built.rows.length > 0) {
    downloadBytes(filename, built.bytes, TRANSFER_XLSX_MIME);
  }
  return {
    filename,
    rowCount: built.rows.length,
    skipped: built.skipped,
    bytes: built.bytes,
  };
}
