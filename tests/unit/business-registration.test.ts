import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  businessActionBlock,
  businessNumberError,
  formatBusinessNumber,
  isValidBusinessRegistrationNumber,
  normalizeBusinessNumber,
  profileStatusFromNts,
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
    assert.equal(businessNumberError(valid), null);
  });

  it('계속사업자는 검수필요, 휴업과 폐업은 휴폐업이다', () => {
    assert.equal(profileStatusFromNts('01', '계속사업자').status, 'review_required');
    assert.equal(profileStatusFromNts('02', '휴업자').status, 'closed');
    assert.equal(profileStatusFromNts('03', '폐업자').status, 'closed');
  });

  it('휴폐업과 반려만 충전과 캠페인 등록을 막는다', () => {
    assert.equal(businessActionBlock('verified', 'charge'), null);
    assert.equal(businessActionBlock('review_required', 'campaign'), null);
    assert.equal(businessActionBlock('unregistered', 'charge'), null);
    assert.match(businessActionBlock('closed', 'charge') ?? '', /충전/);
    assert.match(businessActionBlock('rejected', 'campaign') ?? '', /캠페인/);
  });
});
