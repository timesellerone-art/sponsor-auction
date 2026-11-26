import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  businessActionBlock,
  businessNumberError,
  formatBusinessNumber,
  formatOpeningDateInput,
  isValidBusinessRegistrationNumber,
  normalizeBusinessNumber,
  normalizeOpeningDate,
  openingDateError,
  profileStatusFromNts,
  profileStatusFromNtsAndValidate,
  representativeNameError,
} from '../../src/lib/business-registration';

function withCheckDigit(firstNine: string) {
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const numbers = firstNine.split('').map((item) => Number(item));
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += numbers[index] * weights[index];
  }
  sum += Math.floor((numbers[8] * 5) / 10);
  return `${firstNine}${(10 - (sum % 10)) % 10}`;
}

describe('business registration number', () => {
  it('10자리 체크디짓이 맞는 번호만 받는다', () => {
    const valid = withCheckDigit('533060373');
    assert.equal(isValidBusinessRegistrationNumber(valid), true);
    assert.equal(formatBusinessNumber(`533-06-0373${valid.slice(-1)}`), formatBusinessNumber(valid));
    assert.equal(normalizeBusinessNumber('533-06-03737'), '5330603737');
    assert.equal(businessNumberError('123'), '사업자등록번호 10자리를 확인해 주세요.');
    assert.equal(businessNumberError('1234567890'), '유효하지 않은 사업자등록번호입니다. 번호를 다시 확인해 주세요.');
    assert.equal(businessNumberError(valid), null);
  });

  it('계속사업자는 검수필요, 휴업과 폐업은 휴폐업, 미등록은 미등록이다', () => {
    assert.equal(profileStatusFromNts('01', '계속사업자').status, 'review_required');
    assert.equal(profileStatusFromNts('02', '휴업자').status, 'closed');
    assert.equal(profileStatusFromNts('03', '폐업자').status, 'closed');
    assert.equal(profileStatusFromNts('UNREGISTERED', '미등록').status, 'unregistered');
  });

  it('대표자 성명과 개업일자 형식을 검사한다', () => {
    assert.equal(representativeNameError(''), '대표자 성명을 입력해 주세요.');
    assert.equal(representativeNameError('홍'), '대표자 성명을 2자 이상 입력해 주세요.');
    assert.equal(representativeNameError('홍길동'), null);
    assert.equal(normalizeOpeningDate('2024-01-15'), '20240115');
    assert.equal(formatOpeningDateInput('20240115'), '2024-01-15');
    assert.equal(openingDateError('20241399'), '개업일자가 올바른 날짜가 아닙니다.');
    assert.equal(openingDateError('20240115'), null);
  });

  it('진위확인 불일치는 검수필요로 올리지 않고, 일치하면 기존 status 매핑을 유지한다', () => {
    const mismatched = profileStatusFromNtsAndValidate('01', '계속사업자', '02');
    assert.equal(mismatched.status, 'unregistered');
    assert.equal(mismatched.mismatch, true);
    const matchedActive = profileStatusFromNtsAndValidate('01', '계속사업자', '01');
    assert.equal(matchedActive.status, 'review_required');
    assert.equal(matchedActive.mismatch, false);
    const matchedClosed = profileStatusFromNtsAndValidate('03', '폐업자', '01');
    assert.equal(matchedClosed.status, 'closed');
  });

  it('휴폐업과 반려만 충전과 캠페인 등록을 막는다', () => {
    assert.equal(businessActionBlock('verified', 'charge'), null);
    assert.equal(businessActionBlock('review_required', 'campaign'), null);
    assert.equal(businessActionBlock('unregistered', 'charge'), null);
    assert.match(businessActionBlock('closed', 'charge') ?? '', /충전/);
    assert.match(businessActionBlock('rejected', 'campaign') ?? '', /캠페인/);
  });
});
