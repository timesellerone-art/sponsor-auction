import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPANY, COMPANY_OPERATOR_LINE } from '../../src/lib/company';

describe('company legal identity', () => {
  it('하람커넥트 사업자·고객센터 정보를 고정한다', () => {
    assert.equal(COMPANY.legalName, '하람커넥트');
    assert.equal(COMPANY.ceo, '권경환');
    assert.equal(COMPANY.businessNo, '533-06-03737');
    assert.equal(COMPANY.mailOrderNo, '신고 진행중');
    assert.equal(COMPANY.phone, '070-8027-8425');
    assert.equal(COMPANY.email, 'help@clinkapp.kr');
    assert.equal(COMPANY.address, '충청남도 아산시 번영로217번길 31, 2층 오즈 오피스(모종동)');
    assert.equal(COMPANY.privacyOfficer, '권경환');
    assert.match(COMPANY.phoneHours, /평일 10:00 ~ 17:00/);
    assert.match(COMPANY_OPERATOR_LINE, /하람커넥트/);
    assert.match(COMPANY_OPERATOR_LINE, /533-06-03737/);
    assert.match(COMPANY_OPERATOR_LINE, /help@clinkapp.kr/);
    assert.match(COMPANY_OPERATOR_LINE, /충청남도 아산시 번영로217번길 31, 2층 오즈 오피스\(모종동\)/);
  });
});
